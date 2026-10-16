<script lang="ts" setup>
import { TaoButton, TaoInputNumber, TaoSelect, TaoSwitch } from '@1337exp/taoui';
import { computed } from 'vue';
import { useI18n } from '@/i18n';
import { defaultSystem } from '@/particles/serialize';
import type { Range, Shape, SystemDef, Vec3 } from '@/particles/types';
import { useEditor } from '../store';
import CurveEditor from './CurveEditor.vue';
import GradientEditor from './GradientEditor.vue';

const DEFAULT_SIZE_CURVE = defaultSystem().particle.sizeOverLife;

const editor = useEditor();
const { t } = useI18n();

const edit = (key: string, change: (s: SystemDef) => void) => editor.updateSystem(key, change);
/** Число из поля TaoInputNumber: пусто даёт 0. */
const num = (v: number | null) => v ?? 0;

const rangeOf = (r: Range): [number, number] => (typeof r === 'number' ? [r, r] : r);

type RangeKey = 'lifetime' | 'speed' | 'size' | 'rotation' | 'spin';
const RANGE_KEYS: readonly RangeKey[] = ['lifetime', 'speed', 'size', 'rotation', 'spin'];

function setRange(key: RangeKey, which: 0 | 1, value: number | null) {
    edit(key, (s) => {
        const [lo, hi] = rangeOf(s.particle[key]);
        const v = num(value);
        s.particle[key] = which === 0 ? [v, Math.max(v, hi)] : [Math.min(lo, v), v];
    });
}

const shapes = computed(() => [
    { value: 'point', label: t('particles.shapePoint') },
    { value: 'circle', label: t('particles.shapeCircle') },
    { value: 'cone', label: t('particles.shapeCone') },
    { value: 'box', label: t('particles.shapeBox') },
]);
const blends = computed(() => [
    { value: 'normal', label: t('particles.blendNormal') },
    { value: 'add', label: t('particles.blendAdd') },
]);

function setShapeType(value: string | number | null) {
    const type = value as Shape['type'];
    edit('shape', (s) => {
        s.emitter.shape =
            type === 'circle' ? { type, radius: 1, edge: false } : type === 'cone' ? { type, angle: 25, radius: 0.1 } : type === 'box' ? { type, size: [1, 1, 1] } : { type: 'point' };
    });
}

function setGravity(i: number, value: number | null) {
    edit('gravity', (s) => {
        const v = [...s.particle.gravity] as Vec3;
        v[i] = num(value);
        s.particle.gravity = v;
    });
}

function setBoxSize(i: number, value: number | null) {
    edit('shape', (s) => {
        if (s.emitter.shape.type !== 'box') return;
        const v = [...s.emitter.shape.size] as Vec3;
        v[i] = Math.max(0, num(value));
        s.emitter.shape = { type: 'box', size: v };
    });
}
</script>

<template>
    <aside v-if="editor.system" class="inspector" @pointerdown.stop @wheel.stop>
        <header>
            <strong>{{ t('particles.title') }}</strong>
            <TaoButton size="small" variant="ghost" @click="editor.disableParticles()">{{ t('particles.disable') }}</TaoButton>
        </header>

        <section>
            <h4>{{ t('particles.system') }}</h4>
            <div class="row"><span>{{ t('particles.duration') }}</span><TaoInputNumber size="small" :min="0.1" :step="0.1" :model-value="editor.system.duration" @update:model-value="(v) => edit('duration', (s) => (s.duration = Math.max(0.1, num(v))))" /></div>
            <div class="row"><TaoSwitch size="small" :label="t('particles.loop')" :model-value="editor.system.loop" @update:model-value="(v) => edit('loop', (s) => (s.loop = v))" /></div>
            <div class="row"><span>{{ t('particles.seed') }}</span><TaoInputNumber size="small" :step="1" :model-value="editor.system.seed" @update:model-value="(v) => edit('seed', (s) => (s.seed = Math.trunc(num(v))))" /></div>
            <div class="row"><span>{{ t('particles.maxParticles') }}</span><TaoInputNumber size="small" :min="1" :max="100000" :step="50" :model-value="editor.system.maxParticles" @update:model-value="(v) => edit('max', (s) => (s.maxParticles = Math.min(100000, Math.max(1, Math.trunc(num(v))))))" /></div>
            <div class="row"><span>{{ t('particles.blend') }}</span><TaoSelect size="small" :clearable="false" :model-value="editor.system.blend" :options="blends" @update:model-value="(v) => edit('blend', (s) => (s.blend = v === 'add' ? 'add' : 'normal'))" /></div>
        </section>

        <section>
            <h4>{{ t('particles.emitter') }}</h4>
            <div class="row"><span>{{ t('particles.rate') }}</span><TaoInputNumber size="small" :min="0" :max="10000" :step="5" :model-value="editor.system.emitter.rate" @update:model-value="(v) => edit('rate', (s) => (s.emitter.rate = Math.min(10000, Math.max(0, num(v)))))" /></div>
            <div class="row"><span>{{ t('particles.shape') }}</span><TaoSelect size="small" :clearable="false" :model-value="editor.system.emitter.shape.type" :options="shapes" @update:model-value="setShapeType" /></div>

            <template v-if="editor.system.emitter.shape.type === 'circle'">
                <div class="row"><span>{{ t('particles.radius') }}</span><TaoInputNumber size="small" :min="0" :step="0.1" :model-value="editor.system.emitter.shape.radius" @update:model-value="(v) => edit('shape', (s) => s.emitter.shape.type === 'circle' && (s.emitter.shape.radius = Math.max(0, num(v))))" /></div>
                <div class="row"><TaoSwitch size="small" :label="t('particles.edge')" :model-value="editor.system.emitter.shape.edge === true" @update:model-value="(v) => edit('shape', (s) => s.emitter.shape.type === 'circle' && (s.emitter.shape.edge = v))" /></div>
            </template>
            <template v-if="editor.system.emitter.shape.type === 'cone'">
                <div class="row"><span>{{ t('particles.angle') }}</span><TaoInputNumber size="small" :min="0" :max="180" :step="1" :model-value="editor.system.emitter.shape.angle" @update:model-value="(v) => edit('shape', (s) => s.emitter.shape.type === 'cone' && (s.emitter.shape.angle = Math.min(180, Math.max(0, num(v)))))" /></div>
                <div class="row"><span>{{ t('particles.radius') }}</span><TaoInputNumber size="small" :min="0" :step="0.05" :model-value="editor.system.emitter.shape.radius" @update:model-value="(v) => edit('shape', (s) => s.emitter.shape.type === 'cone' && (s.emitter.shape.radius = Math.max(0, num(v))))" /></div>
            </template>
            <div v-if="editor.system.emitter.shape.type === 'box'" class="row">
                <span>{{ t('particles.boxSize') }}</span>
                <span class="trio"><TaoInputNumber v-for="(v, i) in editor.system.emitter.shape.size" :key="i" size="small" :min="0" :step="0.1" :controls="false" :model-value="v" @update:model-value="(x) => setBoxSize(i, x)" /></span>
            </div>

            <div class="row head">
                <span>{{ t('particles.bursts') }}</span>
                <TaoButton size="small" variant="ghost" @click="edit('bursts', (s) => s.emitter.bursts.push({ time: 0, count: 20 }))">＋ {{ t('particles.addBurst') }}</TaoButton>
            </div>
            <div v-for="(b, i) in editor.system.emitter.bursts" :key="i" class="row burst">
                <TaoInputNumber size="small" :min="0" :step="0.1" :controls="false" :placeholder="t('particles.burstTime')" :model-value="b.time" @update:model-value="(v) => edit(`burst${i}`, (s) => (s.emitter.bursts[i]!.time = Math.max(0, num(v))))" />
                <TaoInputNumber size="small" :min="0" :step="1" :controls="false" :placeholder="t('particles.burstCount')" :model-value="b.count" @update:model-value="(v) => edit(`burst${i}`, (s) => (s.emitter.bursts[i]!.count = Math.max(0, Math.trunc(num(v)))))" />
                <TaoButton size="small" variant="ghost" :aria-label="t('particles.remove')" @click="edit('bursts', (s) => s.emitter.bursts.splice(i, 1))">✕</TaoButton>
            </div>
        </section>

        <section>
            <h4>{{ t('particles.particle') }}</h4>
            <div v-for="key in RANGE_KEYS" :key="key" class="row">
                <span>{{ t(`particles.${key}`) }}</span>
                <span class="trio">
                    <TaoInputNumber size="small" :step="0.1" :controls="false" :placeholder="t('particles.min')" :model-value="rangeOf(editor.system.particle[key])[0]" @update:model-value="(v) => setRange(key, 0, v)" />
                    <TaoInputNumber size="small" :step="0.1" :controls="false" :placeholder="t('particles.max')" :model-value="rangeOf(editor.system.particle[key])[1]" @update:model-value="(v) => setRange(key, 1, v)" />
                </span>
            </div>
            <div class="row">
                <span>{{ t('particles.gravity') }}</span>
                <span class="trio"><TaoInputNumber v-for="(v, i) in editor.system.particle.gravity" :key="i" size="small" :step="0.1" :controls="false" :model-value="v" @update:model-value="(x) => setGravity(i, x)" /></span>
            </div>
            <div class="row"><span>{{ t('particles.drag') }}</span><TaoInputNumber size="small" :min="0" :step="0.05" :model-value="editor.system.particle.drag" @update:model-value="(v) => edit('drag', (s) => (s.particle.drag = Math.max(0, num(v))))" /></div>
        </section>

        <section>
            <h4>{{ t('particles.sizeOverLife') }}</h4>
            <CurveEditor :min="0" :default-value="DEFAULT_SIZE_CURVE" :model-value="editor.system.particle.sizeOverLife" @update:model-value="(v) => edit('sizeOverLife', (s) => (s.particle.sizeOverLife = v))" />
        </section>

        <section>
            <h4>{{ t('particles.colorOverLife') }}</h4>
            <GradientEditor :model-value="editor.system.particle.colorOverLife" @update:model-value="(v) => edit('colorOverLife', (s) => (s.particle.colorOverLife = v))" />
        </section>
    </aside>
</template>

<style scoped>
.inspector {
    position: absolute;
    top: 44px;
    right: 8px;
    bottom: 8px;
    z-index: 5;
    width: 310px;
    overflow-y: auto;
    padding: 8px 10px;
    border: 1px solid var(--tao-color-border, #222733);
    border-radius: 10px;
    background: var(--tao-color-surface, rgba(15, 18, 26, 0.94));
    color: var(--tao-color-text, #d6d9e0);
    font-size: 12px;
}

header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
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
.row :deep(.tao-select) {
    width: 118px;
}

.trio {
    display: inline-flex;
    gap: 4px;
}

.trio :deep(.tao-input-number) {
    width: 58px;
}

.burst :deep(.tao-input-number) {
    width: 84px;
}
</style>
