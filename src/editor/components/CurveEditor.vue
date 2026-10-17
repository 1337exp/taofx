<script lang="ts" setup>
import '@1337exp/taoux/curveeditor.css';
import '@1337exp/taoux/curvefield.css';
import { TaoxCurveField, type CurveFieldLabels } from '@1337exp/taoux/curvefield';
import { computed } from 'vue';
import { useI18n } from '@/i18n';
import type { Curve, CurvePoint } from '@/particles/types';
import { toPoints } from '../curveOps';

// График, поля точки, переход и кнопки это модуль taoux (TaoxCurveField); здесь только перевод надписей и превращение
// числа в плоскую кривую.
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

const points = computed(() => toPoints(props.modelValue));
const defaults = computed(() => (props.defaultValue === undefined ? undefined : toPoints(props.defaultValue)));
const labels = computed<CurveFieldLabels>(() => ({
    time: t('particles.pointTime'),
    value: t('particles.pointValue'),
    transition: t('particles.ease'),
    snap: t('particles.curveSnap'),
    remove: t('particles.remove'),
    reset: t('particles.curveReset'),
    hint: t('particles.curveHint'),
}));
</script>

<template>
    <TaoxCurveField
        :model-value="points"
        :min="min"
        :max="max"
        :default-value="defaults"
        :precision="precision"
        :step-t="STEP_T"
        :labels="labels"
        @update:model-value="(v) => emit('update:modelValue', v)"
        @commit="emit('commit')"
    />
</template>
