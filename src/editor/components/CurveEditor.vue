<script lang="ts" setup>
import { TaoButton, TaoInputNumber, TaoSwitch } from '@1337exp/taoui';
import { TaoxCurveEditor } from '@1337exp/taoux/curveeditor';
import '@1337exp/taoux/curveeditor.css';
import { computed, ref } from 'vue';
import { useI18n } from '@/i18n';
import type { Curve, CurvePoint } from '@/particles/types';
import { clampTo, movePoint, niceStep, removePoint, roundTo, sameCurve, toPoints, valueBounds } from '../curveOps';

// Поле графика (сетка, шаг, границы, автопрокрутка) это модуль taoux; здесь вокруг него поля точки и кнопки на TaoUI.
const props = defineProps<{
    modelValue: Curve;
    /** Допустимые значения: фиксируют вид графика и не дают утащить точку за границу. */
    min?: number;
    max?: number;
    /** Кривая «по умолчанию»: без неё кнопки сброса нет. */
    defaultValue?: Curve;
    /** Сколько знаков после запятой оставлять у времени и значения; не задано — не обрезать. */
    precision?: number;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: CurvePoint[]]; commit: [] }>();
const { t } = useI18n();

const STEP_T = 0.05;

const selected = ref(0);
const snapOn = ref(true);

const points = computed(() => toPoints(props.modelValue));
const current = computed(() => points.value[Math.min(selected.value, points.value.length - 1)]!);
const stepV = computed(() => {
    const b = valueBounds(points.value, props.min, props.max);
    return niceStep(b.max - b.min, 20);
});
const canReset = computed(() => props.defaultValue !== undefined && !sameCurve(points.value, toPoints(props.defaultValue)));

function removeSelected() {
    emit('update:modelValue', removePoint(points.value, selected.value));
    selected.value = 0;
    emit('commit');
}

function setField(field: 't' | 'v', value: number | null) {
    if (value === null || !Number.isFinite(value)) return;
    const p = current.value;
    const tt = field === 't' ? roundTo(value, props.precision) : p.t;
    const v = field === 'v' ? clampTo(roundTo(value, props.precision), props.min, props.max) : p.v;
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
        <TaoxCurveEditor
            :model-value="points"
            v-model:selected="selected"
            :min="min"
            :max="max"
            :precision="precision"
            :snap="snapOn"
            :step-t="STEP_T"
            :hint="t('particles.curveHint')"
            @update:model-value="(v) => emit('update:modelValue', v)"
            @commit="emit('commit')"
        />

        <div class="fields">
            <label>{{ t('particles.pointTime') }}<TaoInputNumber size="small" :min="0" :max="1" :step="STEP_T" :precision="precision" :controls="false" :model-value="current.t" @update:model-value="(x) => setField('t', x)" /></label>
            <label>{{ t('particles.pointValue') }}<TaoInputNumber size="small" :min="min" :max="max" :step="stepV" :precision="precision" :controls="false" :model-value="current.v" @update:model-value="(x) => setField('v', x)" /></label>
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
    --tx-curve-bg: var(--tao-color-surface-sunken);
    --tx-curve-border: var(--tao-color-border);
    --tx-curve-grid: var(--tao-color-border);
    --tx-curve-label: var(--tao-color-text-muted);
    --tx-curve-accent: var(--tao-color-accent);

    display: flex;
    flex-direction: column;
    gap: 8px;
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
