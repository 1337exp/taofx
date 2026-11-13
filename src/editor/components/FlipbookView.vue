<script lang="ts" setup>
import { TaoButton } from '@1337exp/taoui';
import { computed, onBeforeUnmount, onMounted, ref, toRef, watch } from 'vue';
import { useI18n } from '@/i18n';
import { flipbookUi, useFlipbookActions } from '../flipbookActions';
import { useFlipbookImage } from '../flipbookImage';
import { useEditor } from '../store';

// Центр для флипбука: картинка и рамки найденных кадров. Колесо приближает, перетаскивание двигает; в режиме выбора цвета щелчок
// по картинке берёт цвет фона, а щелчок по рамке без него останавливает анимацию на этом кадре.
const editor = useEditor();
const { t } = useI18n();

const body = computed(() => editor.flipbook);
const { pixels, url } = useFlipbookImage(toRef(() => body.value?.image ?? ''));
const actions = useFlipbookActions(pixels);

const host = ref<HTMLElement | null>(null);
const cam = ref({ x: 0, y: 0, z: 1 });
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 32;

/** Подогнать картинку по размеру окна с небольшим полем. */
function fit() {
    const el = host.value;
    const image = pixels.value;
    if (!el || !image) return;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((el.clientWidth - 32) / image.width, (el.clientHeight - 32) / image.height)));
    cam.value = { z, x: (el.clientWidth - image.width * z) / 2, y: (el.clientHeight - image.height * z) / 2 };
}
// по новой картинке камера подбирается заново; та же картинка при правке кадров остаётся как есть
watch(() => pixels.value, (now, was) => (now && now !== was ? requestAnimationFrame(fit) : undefined));
let observer: ResizeObserver | undefined;
onMounted(() => {
    if (host.value) {
        observer = new ResizeObserver(() => !userMoved && fit());
        observer.observe(host.value);
    }
});
onBeforeUnmount(() => observer?.disconnect());
let userMoved = false;

function onWheel(event: WheelEvent) {
    const el = host.value;
    if (!el) return;
    event.preventDefault();
    const rect = el.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const c = cam.value;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, c.z * Math.exp(-event.deltaY * 0.0015)));
    // точка под курсором остаётся на месте
    cam.value = { z, x: px - ((px - c.x) / c.z) * z, y: py - ((py - c.y) / c.z) * z };
    userMoved = true;
}

let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
function onDown(event: PointerEvent) {
    if (event.button !== 0 && event.button !== 1) return;
    drag = { x: event.clientX, y: event.clientY, cx: cam.value.x, cy: cam.value.y, moved: false };
    host.value?.setPointerCapture(event.pointerId);
}
function onMove(event: PointerEvent) {
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true;
    userMoved = true;
    cam.value = { ...cam.value, x: drag.cx + dx, y: drag.cy + dy };
}
function onUp(event: PointerEvent) {
    const d = drag;
    drag = null;
    if (!d || d.moved) return;
    // щелчок без сдвига: точка картинки под курсором
    const el = host.value;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (event.clientX - rect.left - cam.value.x) / cam.value.z;
    const y = (event.clientY - rect.top - cam.value.y) / cam.value.z;
    if (flipbookUi.picking) return actions.pickAt(x, y);
    const hit = body.value?.frames.findIndex((f) => x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h) ?? -1;
    if (hit >= 0) {
        flipbookUi.playing = false;
        flipbookUi.frame = hit;
    }
}

const zoomPercent = computed(() => Math.round(cam.value.z * 100));
const transform = computed(() => ({ transform: `translate(${cam.value.x}px, ${cam.value.y}px) scale(${cam.value.z})` }));
const strokeScale = computed(() => 1 / cam.value.z);
function refit() {
    userMoved = false;
    fit();
}
</script>

<template>
    <div class="flipbook-view">
        <div class="bar">
            <TaoButton variant="ghost" size="small" @click="refit">{{ t('flipbook.fit') }}</TaoButton>
            <span class="zoom">{{ zoomPercent }}%</span>
            <span v-if="flipbookUi.picking" class="hint">{{ t('flipbook.pickHint') }}</span>
        </div>
        <div ref="host" class="viewport" :class="{ picking: flipbookUi.picking }" @wheel="onWheel" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp">
            <div v-if="pixels && url" class="sheet" :style="[transform, { width: pixels.width + 'px', height: pixels.height + 'px' }]">
                <img :src="url" :width="pixels.width" :height="pixels.height" draggable="false" alt="" />
                <svg class="frames" :viewBox="`0 0 ${pixels.width} ${pixels.height}`" :width="pixels.width" :height="pixels.height">
                    <g v-for="(f, i) in body?.frames ?? []" :key="i" :class="{ current: i === flipbookUi.frame }">
                        <rect :x="f.x" :y="f.y" :width="f.w" :height="f.h" :stroke-width="strokeScale * (i === flipbookUi.frame ? 2 : 1)" />
                        <text :x="f.x + 2 * strokeScale" :y="f.y + 12 * strokeScale" :font-size="11 * strokeScale">{{ i + 1 }}</text>
                    </g>
                </svg>
            </div>
            <p v-else class="empty">{{ body?.image ? t('flipbook.imageMissing') : t('flipbook.pickImage') }}</p>
        </div>
    </div>
</template>

<style scoped>
.flipbook-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    background: var(--tao-color-bg, #0b0d12);
}

.bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 12px;
}

.hint {
    color: var(--tao-color-accent, #ffb43a);
}

.viewport {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    cursor: grab;
    touch-action: none;
    /* шахматка: прозрачные места картинки видны */
    background: repeating-conic-gradient(var(--tao-color-surface-raised, #1c1f26) 0% 25%, var(--tao-color-bg, #0b0d12) 0% 50%) 0 0 / 16px 16px;
}

.viewport.picking {
    cursor: crosshair;
}

.sheet {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
}

.sheet img {
    display: block;
    image-rendering: pixelated;
    user-select: none;
}

.frames {
    position: absolute;
    inset: 0;
    pointer-events: none;
}

.frames rect {
    fill: none;
    stroke: var(--tao-color-accent, #ffb43a);
    stroke-opacity: 0.8;
}

.frames text {
    fill: var(--tao-color-accent, #ffb43a);
    font-family: inherit;
}

.frames .current rect {
    fill: rgba(255, 180, 58, 0.14);
    stroke-opacity: 1;
}

.empty {
    display: grid;
    height: 100%;
    margin: 0;
    place-items: center;
    color: var(--tao-color-text-muted, #8b929c);
}
</style>
