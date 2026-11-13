<script lang="ts" setup>
import { TaoButton } from '@1337exp/taoui';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { BakedSheet } from '@/flipbook/flipbook';
import { frameIndexAt } from '@/flipbook/model';
import { useI18n } from '@/i18n';
import { flipbookUi } from '../flipbookActions';

// Анимация флипбука так, как её увидит рантайм: кадры берутся из запечённого листа (фон уже прозрачный, если он вырезается).
const props = defineProps<{ sheet: BakedSheet | null; count: number; fps: number }>();
const { t } = useI18n();

const canvas = ref<HTMLCanvasElement | null>(null);
let source: HTMLCanvasElement | null = null;
let raf = 0;
let start = 0;

// лист кладётся на невидимый холст один раз, потом из него рисуется ячейка
watch(
    () => props.sheet,
    (sheet) => {
        source = null;
        if (!sheet || sheet.width === 0) return;
        source = document.createElement('canvas');
        source.width = sheet.width;
        source.height = sheet.height;
        source.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(sheet.data), sheet.width, sheet.height), 0, 0);
    },
    { immediate: true },
);

function draw() {
    const el = canvas.value;
    const sheet = props.sheet;
    if (!el) return;
    const ctx = el.getContext('2d')!;
    const size = sheet?.cell || 1;
    if (el.width !== size || el.height !== size) {
        el.width = size;
        el.height = size;
    }
    ctx.clearRect(0, 0, size, size);
    if (!sheet || !source || props.count < 1) return;
    const i = Math.min(Math.max(0, flipbookUi.frame), props.count - 1);
    ctx.drawImage(source, (i % sheet.cols) * size, Math.floor(i / sheet.cols) * size, size, size, 0, 0, size, size);
}

function tick(now: number) {
    if (flipbookUi.playing && props.count > 0) {
        const i = frameIndexAt(props.count, props.fps, (now - start) / 1000);
        if (i !== flipbookUi.frame) flipbookUi.frame = i;
    }
    draw();
    raf = requestAnimationFrame(tick);
}

// продолжение с того кадра, на котором остановились
watch(
    () => flipbookUi.playing,
    (playing) => {
        if (playing) start = performance.now() - (flipbookUi.frame / Math.max(props.fps, 1e-6)) * 1000;
    },
);

onMounted(() => {
    start = performance.now() - (flipbookUi.frame / Math.max(props.fps, 1e-6)) * 1000;
    raf = requestAnimationFrame(tick);
});
onBeforeUnmount(() => cancelAnimationFrame(raf));
</script>

<template>
    <div class="player">
        <div class="stage"><canvas ref="canvas" class="canvas" /></div>
        <div class="bar">
            <TaoButton variant="secondary" size="small" :disabled="count < 1" @click="flipbookUi.playing = !flipbookUi.playing">{{ flipbookUi.playing ? t('flipbook.pause') : t('flipbook.play') }}</TaoButton>
            <span class="info">{{ count > 0 ? t('flipbook.frameOf', [Math.min(flipbookUi.frame, count - 1) + 1, count]) : t('flipbook.noFrames') }}</span>
        </div>
    </div>
</template>

<style scoped>
.player {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.stage {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    border: 1px solid var(--tao-color-border, #2a2d33);
    border-radius: var(--tao-radius-control, 8px);
    /* шахматка: прозрачные места кадра видны */
    background: repeating-conic-gradient(var(--tao-color-surface-raised, #1c1f26) 0% 25%, var(--tao-color-bg, #0b0d12) 0% 50%) 0 0 / 16px 16px;
}

.canvas {
    max-width: 100%;
    max-height: 100%;
    image-rendering: pixelated;
}

.bar {
    display: flex;
    align-items: center;
    gap: 8px;
}

.info {
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 12px;
}
</style>
