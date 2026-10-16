<script lang="ts" setup>
import { computed, ref } from 'vue';
import { useI18n } from '@/i18n';
import type { Curve, CurvePoint } from '@/particles/types';
import { addPoint, movePoint, removePoint, toPoints, valueBounds } from '../curveOps';

const props = defineProps<{ modelValue: Curve }>();
const emit = defineEmits<{ 'update:modelValue': [value: CurvePoint[]]; commit: [] }>();
const { t } = useI18n();

const W = 240;
const H = 88;
const PAD = 8;
const svg = ref<SVGSVGElement | null>(null);

const points = computed(() => toPoints(props.modelValue));
// Пределы запоминаем на время перетаскивания: иначе график «плыл» бы под рукой
const frozen = ref<{ min: number; max: number } | null>(null);
const bounds = computed(() => frozen.value ?? valueBounds(points.value));

const px = (tt: number) => PAD + tt * (W - PAD * 2);
const py = (v: number) => H - PAD - ((v - bounds.value.min) / (bounds.value.max - bounds.value.min)) * (H - PAD * 2);
const path = computed(() => points.value.map((p, i) => `${i === 0 ? 'M' : 'L'} ${px(p.t).toFixed(1)} ${py(p.v).toFixed(1)}`).join(' '));

/** Координаты указателя в единицах кривой: t и значение. */
function toCurve(e: PointerEvent | MouseEvent): { t: number; v: number } {
    const r = svg.value!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    const { min, max } = bounds.value;
    return { t: (x - PAD) / (W - PAD * 2), v: min + ((H - PAD - y) / (H - PAD * 2)) * (max - min) };
}

let dragging = -1;

function onDown(e: PointerEvent, i: number) {
    if (e.altKey) {
        emit('update:modelValue', removePoint(points.value, i));
        emit('commit');
        return;
    }
    dragging = i;
    frozen.value = valueBounds(points.value);
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
}

function onMove(e: PointerEvent) {
    if (dragging < 0) return;
    const { t: tt, v } = toCurve(e);
    emit('update:modelValue', movePoint(points.value, dragging, tt, Math.round(v * 1000) / 1000));
}

function onUp() {
    if (dragging < 0) return;
    dragging = -1;
    frozen.value = null;
    emit('commit');
}

function onDouble(e: MouseEvent) {
    const { t: tt } = toCurve(e);
    emit('update:modelValue', addPoint(points.value, tt).points);
    emit('commit');
}
</script>

<template>
    <svg ref="svg" class="curve" :viewBox="`0 0 ${W} ${H}`" :title="t('particles.curveHint')" @dblclick.self="onDouble">
        <line class="axis" :x1="PAD" :x2="W - PAD" :y1="py(0)" :y2="py(0)" />
        <line class="axis" :x1="PAD" :x2="W - PAD" :y1="py(1)" :y2="py(1)" />
        <path class="line" :d="path" />
        <circle
            v-for="(p, i) in points"
            :key="i"
            class="dot"
            :cx="px(p.t)"
            :cy="py(p.v)"
            r="5"
            @pointerdown.stop="onDown($event, i)"
            @pointermove="onMove"
            @pointerup="onUp"
            @pointercancel="onUp"
        />
    </svg>
</template>

<style scoped>
.curve {
    display: block;
    width: 100%;
    height: auto;
    border: 1px solid var(--tao-color-border);
    border-radius: 4px;
    background: var(--tao-color-surface-sunken);
    touch-action: none;
}

.axis {
    stroke: var(--tao-color-border);
    stroke-width: 1;
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

.dot:hover {
    fill: var(--tao-color-accent);
}
</style>
