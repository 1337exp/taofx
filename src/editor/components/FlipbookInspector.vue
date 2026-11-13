<script lang="ts" setup>
import { TaoButton, TaoColorInput, TaoInputNumber, TaoSegmented, TaoSegmentedOption, TaoSelect, TaoSlider, TaoSwitch } from '@1337exp/taoui';
import { computed, toRef } from 'vue';
import { formatHex, parseColor } from '@/flipbook/color';
import { bakeSheet } from '@/flipbook/flipbook';
import type { Detect } from '@/flipbook/model';
import { useI18n } from '@/i18n';
import { flipbookUi, useFlipbookActions } from '../flipbookActions';
import { useFlipbookImage } from '../flipbookImage';
import { useEditor } from '../store';
import FlipbookPlayer from './FlipbookPlayer.vue';

// Инспектор флипбука: какая картинка, как найдены кадры, какой фон вырезается, с какой частотой играет; сверху анимация.
const editor = useEditor();
const { t } = useI18n();

const body = computed(() => editor.flipbook!);
const { pixels } = useFlipbookImage(toRef(() => body.value.image));
const actions = useFlipbookActions(pixels);

const images = computed(() => {
    void editor.projectRevision;
    return editor.project.resources.filter((r) => r.kind === 'image').map((r) => ({ value: r.id, label: r.path.slice(r.path.lastIndexOf('/') + 1) }));
});
const imageMissing = computed(() => body.value.image !== '' && !images.value.some((i) => i.value === body.value.image));

const sheet = computed(() => (pixels.value && body.value.frames.length > 0 ? bakeSheet(pixels.value, body.value.frames, body.value.key ? { key: body.value.key } : {}) : null));

const num = (v: number | null) => v ?? 0;
const grid = computed(() => (body.value.detect.mode === 'grid' ? body.value.detect : null));
const auto = computed(() => (body.value.detect.mode === 'auto' ? body.value.detect : null));

function setGrid(patch: Partial<{ cols: number; rows: number }>) {
    const d = grid.value;
    if (!d) return;
    const next: Detect = { mode: 'grid', cols: Math.max(1, Math.trunc(patch.cols ?? d.cols)), rows: Math.max(1, Math.trunc(patch.rows ?? d.rows)) };
    actions.setDetect(next);
}
function setAuto(patch: Partial<{ tolerance: number; gap: number; minSize: number }>) {
    const d = auto.value;
    if (d) actions.setDetect({ ...d, ...patch });
}
const hexOf = (c: readonly [number, number, number]) => formatHex(c);
const onColor = (value: string | null) => {
    const color = value ? parseColor(value) : null;
    if (color) actions.setBackground(color);
};
function setKeyEdge(which: 'low' | 'high', value: number | null) {
    const key = body.value.key;
    if (!key) return;
    const v = Math.max(0, num(value));
    actions.setKey(which === 'low' ? { ...key, low: v, high: Math.max(v, key.high) } : { ...key, high: v, low: Math.min(key.low, v) }, `key.${which}`);
}
</script>

<template>
    <div class="flip-inspector">
        <FlipbookPlayer :sheet="sheet" :count="body.frames.length" :fps="body.fps" />

        <section>
            <h4>{{ t('flipbook.image') }}</h4>
            <TaoSelect
                :clearable="false"
                :placeholder="t('flipbook.pickImage')"
                :model-value="body.image || null"
                :options="images"
                @update:model-value="(v) => actions.setImage(v === null ? '' : String(v))"
            />
            <p v-if="imageMissing" class="warn">{{ t('flipbook.imageMissing') }}</p>
            <p v-else-if="pixels" class="muted">{{ pixels.width }} × {{ pixels.height }}</p>
        </section>

        <section v-if="pixels">
            <h4>{{ t('flipbook.frames') }}</h4>
            <TaoSegmented :model-value="body.detect.mode" :aria-label="t('flipbook.mode')" @update:model-value="(v) => actions.setMode(v === 'auto' ? 'auto' : 'grid')">
                <TaoSegmentedOption value="grid" :label="t('flipbook.modeGrid')" />
                <TaoSegmentedOption value="auto" :label="t('flipbook.modeAuto')" />
            </TaoSegmented>

            <template v-if="grid">
                <div class="row"><span>{{ t('flipbook.cols') }}</span><TaoInputNumber :min="1" :step="1" :model-value="grid.cols" @update:model-value="(v) => setGrid({ cols: num(v) })" /></div>
                <div class="row"><span>{{ t('flipbook.rows') }}</span><TaoInputNumber :min="1" :step="1" :model-value="grid.rows" @update:model-value="(v) => setGrid({ rows: num(v) })" /></div>
            </template>
            <template v-if="auto">
                <div class="row">
                    <span>{{ t('flipbook.background') }}</span>
                    <span class="pick">
                        <TaoColorInput size="small" :model-value="hexOf(auto.color)" @update:model-value="onColor" />
                        <TaoButton variant="secondary" size="small" :aria-pressed="flipbookUi.picking" @click="flipbookUi.picking = !flipbookUi.picking">{{ flipbookUi.picking ? t('flipbook.picking') : t('flipbook.pickColor') }}</TaoButton>
                    </span>
                </div>
                <div class="row"><span>{{ t('flipbook.tolerance') }}</span><TaoInputNumber :min="0" :max="100" :step="1" :model-value="auto.tolerance" @update:model-value="(v) => setAuto({ tolerance: Math.min(100, Math.max(0, num(v))) })" /></div>
                <div class="row"><span>{{ t('flipbook.gap') }}</span><TaoInputNumber :min="0" :step="1" :model-value="auto.gap" @update:model-value="(v) => setAuto({ gap: Math.max(0, Math.trunc(num(v))) })" /></div>
                <div class="row"><span>{{ t('flipbook.minSize') }}</span><TaoInputNumber :min="1" :step="1" :model-value="auto.minSize" @update:model-value="(v) => setAuto({ minSize: Math.max(1, Math.trunc(num(v))) })" /></div>
            </template>
            <p class="muted">{{ body.frames.length > 0 ? t('flipbook.found', [body.frames.length]) : t('flipbook.noFrames') }}</p>
        </section>

        <section v-if="pixels">
            <h4>{{ t('flipbook.keyTitle') }}</h4>
            <div class="row"><TaoSwitch :label="t('flipbook.key')" :model-value="body.key !== null" @update:model-value="(v: boolean) => actions.toggleKey(v)" /></div>
            <template v-if="body.key">
                <div class="row"><span>{{ t('flipbook.background') }}</span><TaoColorInput size="small" :model-value="hexOf(body.key.color)" @update:model-value="onColor" /></div>
                <div class="row"><span>{{ t('flipbook.keyLow') }}</span><TaoSlider variant="thin" :min="0" :max="128" :step="1" :model-value="body.key.low" @update:model-value="(v: number) => setKeyEdge('low', v)" /></div>
                <div class="row"><span>{{ t('flipbook.keyHigh') }}</span><TaoSlider variant="thin" :min="0" :max="128" :step="1" :model-value="body.key.high" @update:model-value="(v: number) => setKeyEdge('high', v)" /></div>
            </template>
        </section>

        <section>
            <h4>{{ t('flipbook.playback') }}</h4>
            <div class="row"><span>{{ t('flipbook.fps') }}</span><TaoInputNumber :min="1" :max="240" :step="1" :model-value="body.fps" @update:model-value="(v) => actions.patch({ fps: Math.min(240, Math.max(1, num(v))) }, 'fps')" /></div>
            <p v-if="sheet" class="muted">{{ t('flipbook.sheet', [sheet.cols, sheet.rows, sheet.cell]) }}</p>
        </section>
    </div>
</template>

<style scoped>
.flip-inspector {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 12px;
}

h4 {
    margin: 12px 0 6px;
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 5px 0;
}

.row > span:first-child {
    flex: 1;
    min-width: 0;
}

.row :deep(.tao-input-number),
.row :deep(.tao-slider) {
    width: 118px;
}

.pick {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.muted,
.warn {
    margin: 4px 0 0;
    color: var(--tao-color-text-muted, #8b929c);
}

.warn {
    color: var(--tao-color-danger, #ff8f8f);
}
</style>
