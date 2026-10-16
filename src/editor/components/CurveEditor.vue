<script lang="ts" setup>
import { TaoButton, TaoInputNumber, TaoSwitch } from '@1337exp/taoui';
import { computed, ref } from 'vue';
import { useI18n } from '@/i18n';
import type { Curve, CurvePoint } from '@/particles/types';
import { addPoint, clampTo, movePoint, niceStep, removePoint, sameCurve, snapTo, ticks, toPoints, valueBounds } from '../curveOps';

const props = defineProps<{
    modelValue: Curve;
    /** Допустимые значения: фиксируют вид графика и не дают утащить точку за границу. */
    min?: number;
    max?: number;
    /** Кривая «по умолчанию»: без неё кнопки сброса нет. */
    defaultValue?: Curve;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: CurvePoint[]]; commit: [] }>();
const { t } = useI18n();

const W = 280;
const H = 132;
const PAD_L = 30;
const PAD_R = 10;
const PAD_T = 10;
const PAD_B = 16;
const PLOT_W = W - PAD_L - PAD_R;
const PLOT_H = H - PAD_T - PAD_B;

/** Шаг по времени: 20 делений на всю жизнь. Крупные линии (с подписью) каждые 0.25. */
const STEP_T = 0.05;
const MAJOR_T = 0.25;

const svg = ref<SVGSVGElement | null>(null);
const selected = ref(0);
const snapOn = ref(true);

const points = computed(() => toPoints(props.modelValue));
// Пределы запоминаем на время перетаскивания: иначе график «плыл» бы под рукой
const frozen = ref<{ min: number; max: number } | null>(null);
const bounds = computed(() => frozen.value ?? valueBounds(points.value, props.min, props.max));
const span = computed(() => bounds.value.max - bounds.value.min);

const majorV = computed(() => niceStep(span.value, 4));
const stepV = computed(() => niceStep(span.value, 20));
const gridT = computed(() => ticks(0, 1, STEP_T));
const gridV = computed(() => ticks(bounds.value.min, bounds.value.max, stepV.value));
const labelsV = computed(() => ticks(bounds.value.min, bounds.value.max, majorV.value));
const labelsT = computed(() => ticks(0, 1, MAJOR_T));
const isMajorT = (x: number) => Math.abs(x / MAJOR_T - Math.round(x / MAJOR_T)) < 1e-6;
const isMajorV = (v: number) => Math.abs(v / majorV.value - Math.round(v / majorV.value)) < 1e-6;

const px = (tt: number) => PAD_L + tt * PLOT_W;
const py = (v: number) => PAD_T + (1 - (v - bounds.value.min) / span.value) * PLOT_H;
const path = computed(() => points.value.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.t).toFixed(1)} ${py(p.v).toFixed(1)}`).join(' '));
const fmt = (n: number) => String(Math.round(n * 1000) / 1000);

const current = computed(() => points.value[Math.min(selected.value, points.value.length - 1)]!);
const canReset = computed(() => props.defaultValue !== undefined && !sameCurve(points.value, toPoints(props.defaultValue)));

/** Координаты указателя в единицах кривой; Shift временно меняет режим шага. */
function toCurve(e: PointerEvent | MouseEvent): { t: number; v: number } {
    const r = svg.value!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    const { min, max } = bounds.value;
    let tt = (x - PAD_L) / PLOT_W;
    let v = min + (1 - (y - PAD_T) / PLOT_H) * (max - min);
    if (snapOn.value !== e.shiftKey) {
        tt = snapTo(tt, STEP_T);
        v = snapTo(v, stepV.value);
    }
    return { t: tt, v: clampTo(Math.round(v * 1000) / 1000, props.min, props.max) };
}

let dragging = -1;

function onDown(e: PointerEvent, i: number) {
    selected.value = i;
    if (e.altKey) {
        emit('update:modelValue', removePoint(points.value, i));
        selected.value = 0;
        emit('commit');
        return;
    }
    dragging = i;
    frozen.value = valueBounds(points.value, props.min, props.max);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
}

function onMove(e: PointerEvent) {
    if (dragging < 0) return;
    const { t: tt, v } = toCurve(e);
    emit('update:modelValue', movePoint(points.value, dragging, tt, v));
}

function onUp() {
    if (dragging < 0) return;
    dragging = -1;
    frozen.value = null;
    emit('commit');
}

function onDouble(e: MouseEvent) {
    const { t: tt, v } = toCurve(e);
    const r = addPoint(points.value, tt, v);
    selected.value = r.index;
    emit('update:modelValue', r.points);
    emit('commit');
}

function removeSelected() {
    emit('update:modelValue', removePoint(points.value, selected.value));
    selected.value = 0;
    emit('commit');
}

function onKey(e: KeyboardEvent) {
    if (e.key !== 'Delete' && e.key !== 'Backspace') return;
    e.preventDefault();
    removeSelected();
}

function setField(field: 't' | 'v', value: number | null) {
    if (value === null || !Number.isFinite(value)) return;
    const p = current.value;
    const tt = field === 't' ? value : p.t;
    const v = field === 'v' ? clampTo(value, props.min, props.max) : p.v;
    emit('update:modelValue', movePoint(points.value, selected.value, tt, v));
    emit('commit');
}

function reset() {
    if (props.defaultValue === undefined) return;
    selected.value = 0;
    emit('update:modelValue', toPoints(props.defaultValue));
    emit('commit');
}
</script>

<template>
    <div class="curve-editor">
        <svg ref="svg" class="curve" :viewBox="`0 0 ${W} ${H}`" :title="t('particles.curveHint')" tabindex="0" @dblclick.self="onDouble" @keydown="onKey">
            <!-- мелкая сетка: те же шаги, что у прилипания -->
            <line v-for="x in gridT" :key="`gt${x}`" class="grid" :class="{ major: isMajorT(x) }" :x1="px(x)" :x2="px(x)" :y1="PAD_T" :y2="H - PAD_B" />
            <line v-for="v in gridV" :key="`gv${v}`" class="grid" :class="{ major: isMajorV(v) }" :x1="PAD_L" :x2="W - PAD_R" :y1="py(v)" :y2="py(v)" />

            <text v-for="v in labelsV" :key="`lv${v}`" class="label" :x="PAD_L - 4" :y="py(v)" text-anchor="end" dominant-baseline="middle">{{ fmt(v) }}</text>
            <text v-for="x in labelsT" :key="`lt${x}`" class="label" :x="px(x)" :y="H - 4" :text-anchor="x === 0 ? 'start' : x === 1 ? 'end' : 'middle'">{{ fmt(x) }}</text>

            <path class="line" :d="path" />
            <circle
                v-for="(p, i) in points"
                :key="i"
                class="dot"
                :class="{ on: i === selected }"
                :cx="px(p.t)"
                :cy="py(p.v)"
                r="5"
                @pointerdown.stop="onDown($event, i)"
                @pointermove="onMove"
                @pointerup="onUp"
                @pointercancel="onUp"
            />
        </svg>

        <div class="fields">
            <label>{{ t('particles.pointTime') }}<TaoInputNumber size="small" :min="0" :max="1" :step="STEP_T" :controls="false" :model-value="current.t" @update:model-value="(x) => setField('t', x)" /></label>
            <label>{{ t('particles.pointValue') }}<TaoInputNumber size="small" :min="min" :max="max" :step="stepV" :controls="false" :model-value="current.v" @update:model-value="(x) => setField('v', x)" /></label>
        </div>

        <div class="bar">
            <TaoSwitch v-model="snapOn" :label="t('particles.curveSnap')" />
            <span class="spacer" />
            <TaoButton size="small" variant="ghost" :disabled="points.length <= 2" @click="removeSelected">{{ t('particles.remove') }}</TaoButton>
            <TaoButton v-if="defaultValue !== undefined" size="small" variant="ghost" :disabled="!canReset" @click="reset">{{ t('particles.curveReset') }}</TaoButton>
        </div>
    </div>
</template>

<style scoped>
.curve-editor {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.curve {
    display: block;
    width: 100%;
    height: auto;
    border: 1px solid var(--tao-color-border);
    border-radius: 4px;
    background: var(--tao-color-surface-sunken);
    touch-action: none;
    outline: none;
}

.curve:focus-visible {
    border-color: var(--tao-color-accent);
}

.grid {
    pointer-events: none; /* иначе двойной клик попадает в линию сетки, а не в поле */
    stroke: var(--tao-color-border);
    stroke-width: 0.5;
    opacity: 0.45;
}

.grid.major {
    stroke-width: 1;
    opacity: 1;
}

.label {
    fill: var(--tao-color-text-muted);
    font-size: 8px;
    pointer-events: none;
    user-select: none;
}

.line {
    fill: none;
    stroke: var(--tao-color-accent);
    stroke-width: 2;
    pointer-events: none;
}

.dot {
    fill: var(--tao-color-surface-sunken);
    stroke: var(--tao-color-accent);
    stroke-width: 2;
    cursor: grab;
}

.dot.on,
.dot:hover {
    fill: var(--tao-color-accent);
}

.fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
}

.fields label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: var(--tao-color-text-muted);
    font-size: 11px;
}

.bar {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
}

.spacer {
    flex: 1;
}
</style>
