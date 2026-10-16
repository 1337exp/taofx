<script lang="ts" setup>
import { useI18n } from '@/i18n';
import type { Range, Shape, SystemDef, Vec3 } from '@/particles/types';
import { parseNumber } from '../values';
import { useEditor } from '../store';
import CurveEditor from './CurveEditor.vue';
import GradientEditor from './GradientEditor.vue';

const editor = useEditor();
const { t } = useI18n();

const edit = (key: string, change: (s: SystemDef) => void) => editor.updateSystem(key, change);
const numberOf = (e: Event) => parseNumber((e.target as HTMLInputElement).value);

const rangeOf = (r: Range): [number, number] => (typeof r === 'number' ? [r, r] : r);

type RangeKey = 'lifetime' | 'speed' | 'size' | 'rotation' | 'spin';
function setRange(key: RangeKey, which: 0 | 1, e: Event) {
    edit(key, (s) => {
        const [lo, hi] = rangeOf(s.particle[key]);
        const v = numberOf(e);
        s.particle[key] = which === 0 ? [v, Math.max(v, hi)] : [Math.min(lo, v), v];
    });
}

function setShapeType(type: Shape['type']) {
    edit('shape', (s) => {
        s.emitter.shape =
            type === 'circle' ? { type, radius: 1, edge: false } : type === 'cone' ? { type, angle: 25, radius: 0.1 } : type === 'box' ? { type, size: [1, 1, 1] } : { type: 'point' };
    });
}

const setVec = (key: 'gravity', i: number, e: Event) =>
    edit(key, (s) => {
        const v = [...s.particle.gravity] as Vec3;
        v[i] = numberOf(e);
        s.particle.gravity = v;
    });

const setBoxSize = (i: number, e: Event) =>
    edit('shape', (s) => {
        if (s.emitter.shape.type !== 'box') return;
        const v = [...s.emitter.shape.size] as Vec3;
        v[i] = Math.max(0, numberOf(e));
        s.emitter.shape = { type: 'box', size: v };
    });
</script>

<template>
    <aside v-if="editor.system" class="inspector" @pointerdown.stop @wheel.stop>
        <header>
            <strong>{{ t('particles.title') }}</strong>
            <button @click="editor.disableParticles()">{{ t('particles.disable') }}</button>
        </header>

        <section>
            <h4>{{ t('particles.system') }}</h4>
            <label>{{ t('particles.duration') }}<input type="number" min="0.1" step="0.1" :value="editor.system.duration" @input="edit('duration', (s) => (s.duration = Math.max(0.1, numberOf($event))))" /></label>
            <label class="check"><input type="checkbox" :checked="editor.system.loop" @change="edit('loop', (s) => (s.loop = !s.loop))" />{{ t('particles.loop') }}</label>
            <label>{{ t('particles.seed') }}<input type="number" step="1" :value="editor.system.seed" @input="edit('seed', (s) => (s.seed = Math.trunc(numberOf($event))))" /></label>
            <label>{{ t('particles.maxParticles') }}<input type="number" min="1" max="100000" step="50" :value="editor.system.maxParticles" @input="edit('max', (s) => (s.maxParticles = Math.min(100000, Math.max(1, Math.trunc(numberOf($event))))))" /></label>
            <label>{{ t('particles.blend') }}
                <select :value="editor.system.blend" @change="edit('blend', (s) => (s.blend = s.blend === 'add' ? 'normal' : 'add'))">
                    <option value="normal">{{ t('particles.blendNormal') }}</option>
                    <option value="add">{{ t('particles.blendAdd') }}</option>
                </select>
            </label>
        </section>

        <section>
            <h4>{{ t('particles.emitter') }}</h4>
            <label>{{ t('particles.rate') }}<input type="number" min="0" max="10000" step="5" :value="editor.system.emitter.rate" @input="edit('rate', (s) => (s.emitter.rate = Math.min(10000, Math.max(0, numberOf($event)))))" /></label>

            <label>{{ t('particles.shape') }}
                <select :value="editor.system.emitter.shape.type" @change="setShapeType(($event.target as HTMLSelectElement).value as Shape['type'])">
                    <option value="point">{{ t('particles.shapePoint') }}</option>
                    <option value="circle">{{ t('particles.shapeCircle') }}</option>
                    <option value="cone">{{ t('particles.shapeCone') }}</option>
                    <option value="box">{{ t('particles.shapeBox') }}</option>
                </select>
            </label>
            <template v-if="editor.system.emitter.shape.type === 'circle'">
                <label>{{ t('particles.radius') }}<input type="number" min="0" step="0.1" :value="editor.system.emitter.shape.radius" @input="edit('shape', (s) => s.emitter.shape.type === 'circle' && (s.emitter.shape.radius = Math.max(0, numberOf($event))))" /></label>
                <label class="check"><input type="checkbox" :checked="editor.system.emitter.shape.edge" @change="edit('shape', (s) => s.emitter.shape.type === 'circle' && (s.emitter.shape.edge = !s.emitter.shape.edge))" />{{ t('particles.edge') }}</label>
            </template>
            <template v-if="editor.system.emitter.shape.type === 'cone'">
                <label>{{ t('particles.angle') }}<input type="number" min="0" max="180" step="1" :value="editor.system.emitter.shape.angle" @input="edit('shape', (s) => s.emitter.shape.type === 'cone' && (s.emitter.shape.angle = Math.min(180, Math.max(0, numberOf($event)))))" /></label>
                <label>{{ t('particles.radius') }}<input type="number" min="0" step="0.05" :value="editor.system.emitter.shape.radius" @input="edit('shape', (s) => s.emitter.shape.type === 'cone' && (s.emitter.shape.radius = Math.max(0, numberOf($event))))" /></label>
            </template>
            <label v-if="editor.system.emitter.shape.type === 'box'">{{ t('particles.boxSize') }}
                <span class="trio"><input v-for="(v, i) in editor.system.emitter.shape.size" :key="i" type="number" min="0" step="0.1" :value="v" @input="setBoxSize(i, $event)" /></span>
            </label>

            <div class="bursts">
                <div class="row-head">
                    <span>{{ t('particles.bursts') }}</span>
                    <button @click="edit('bursts', (s) => s.emitter.bursts.push({ time: 0, count: 20 }))">＋ {{ t('particles.addBurst') }}</button>
                </div>
                <div v-for="(b, i) in editor.system.emitter.bursts" :key="i" class="burst">
                    <input type="number" min="0" step="0.1" :value="b.time" :title="t('particles.burstTime')" @input="edit(`burst${i}`, (s) => (s.emitter.bursts[i]!.time = Math.max(0, numberOf($event))))" />
                    <input type="number" min="0" step="1" :value="b.count" :title="t('particles.burstCount')" @input="edit(`burst${i}`, (s) => (s.emitter.bursts[i]!.count = Math.max(0, Math.trunc(numberOf($event)))))" />
                    <button :title="t('particles.remove')" @click="edit('bursts', (s) => s.emitter.bursts.splice(i, 1))">✕</button>
                </div>
            </div>
        </section>

        <section>
            <h4>{{ t('particles.particle') }}</h4>
            <div v-for="key in (['lifetime', 'speed', 'size', 'rotation', 'spin'] as const)" :key="key" class="range">
                <span>{{ t(`particles.${key}`) }}</span>
                <input type="number" step="0.1" :value="rangeOf(editor.system.particle[key])[0]" :title="t('particles.min')" @input="setRange(key, 0, $event)" />
                <input type="number" step="0.1" :value="rangeOf(editor.system.particle[key])[1]" :title="t('particles.max')" @input="setRange(key, 1, $event)" />
            </div>
            <label>{{ t('particles.gravity') }}
                <span class="trio"><input v-for="(v, i) in editor.system.particle.gravity" :key="i" type="number" step="0.1" :value="v" @input="setVec('gravity', i, $event)" /></span>
            </label>
            <label>{{ t('particles.drag') }}<input type="number" min="0" step="0.05" :value="editor.system.particle.drag" @input="edit('drag', (s) => (s.particle.drag = Math.max(0, numberOf($event))))" /></label>
        </section>

        <section>
            <h4>{{ t('particles.sizeOverLife') }}</h4>
            <CurveEditor :model-value="editor.system.particle.sizeOverLife" @update:model-value="(v) => edit('sizeOverLife', (s) => (s.particle.sizeOverLife = v))" />
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
    width: 290px;
    overflow-y: auto;
    padding: 8px 10px;
    border: 1px solid #222733;
    border-radius: 8px;
    background: rgba(15, 18, 26, 0.94);
    font-size: 12px;
}

header,
.row-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
}

h4 {
    margin: 12px 0 6px;
    color: #8b929c;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

label,
.range {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin: 4px 0;
}

label.check {
    justify-content: flex-start;
}

input[type='number'],
select {
    width: 78px;
    padding: 2px 4px;
    border: 1px solid #2c3347;
    border-radius: 3px;
    background: #10131a;
    color: inherit;
    font: inherit;
}

.range input {
    width: 60px;
}

.range span {
    flex: 1;
}

.trio {
    display: inline-flex;
    gap: 3px;
}

.trio input {
    width: 48px;
}

.bursts {
    margin-top: 6px;
}

.burst {
    display: flex;
    gap: 6px;
    margin: 3px 0;
}

.burst input {
    width: 70px;
}

button {
    padding: 2px 8px;
    border: 1px solid #2c3347;
    border-radius: 4px;
    background: #1b2030;
    color: inherit;
    font: inherit;
    cursor: pointer;
}
</style>
