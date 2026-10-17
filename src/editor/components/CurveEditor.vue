<script lang="ts" setup>
import { TaoButton, TaoInputNumber, TaoSegmented, TaoSegmentedOption, TaoSelect, TaoSwitch } from '@1337exp/taoui';
import { movePoint, removePoint, setEase, TaoxCurveEditor, valueBounds } from '@1337exp/taoux/curveeditor';
import '@1337exp/taoux/curveeditor.css';
import { DEFAULT_BEZIER, EASE_DIRECTIONS, EASE_FAMILIES, easeName, easeParts, type EaseDirection, type EaseFamily } from '@1337exp/taoux/ease';
import { clampTo, niceStep, roundTo } from '@1337exp/taoux/num';
import { computed, ref } from 'vue';
import { useI18n } from '@/i18n';
import type { Curve, CurvePoint } from '@/particles/types';
import { sameCurve, toPoints } from '../curveOps';

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

// Переход от выбранной точки к следующей: «вид» (линейно, ступенька, семейство или своя кривая) и направление
const isLast = computed(() => selected.value >= points.value.length - 1);
const kind = computed(() => {
    const e = current.value.ease;
    if (e === undefined || e === 'linear') return 'linear';
    if (typeof e === 'object') return 'bezier';
    return easeParts(e)?.family ?? e;
});
const direction = computed<EaseDirection>(() => {
    const e = current.value.ease;
    return typeof e === 'string' ? (easeParts(e)?.direction ?? 'in-out') : 'in-out';
});
// у linear, step и Безье направления нет: переключатель остаётся на месте неактивным, чтобы было видно, как это устроено
const hasDirection = computed(() => !isLast.value && typeof current.value.ease === 'string' && easeParts(current.value.ease) !== null);
const kindOptions = computed(() => [
    // названия функций не переводим: их знают по CSS и библиотекам анимации, по переводу не найдут
    ...['linear', 'step', ...EASE_FAMILIES, 'bezier'].map((v) => ({ value: v, label: v })),
]);

function applyEase(next: Parameters<typeof setEase>[2]) {
    emit('update:modelValue', setEase(points.value, selected.value, next));
    emit('commit');
}

function setKind(v: string | number | null) {
    if (typeof v !== 'string') return;
    if (v === 'linear' || v === 'step') applyEase(v);
    else if (v === 'bezier') applyEase({ bezier: DEFAULT_BEZIER });
    else applyEase(easeName(v as EaseFamily, direction.value));
}

function setDirection(v: unknown) {
    const e = current.value.ease;
    const parts = typeof e === 'string' ? easeParts(e) : null;
    if (parts && typeof v === 'string' && (EASE_DIRECTIONS as readonly string[]).includes(v)) applyEase(easeName(parts.family, v as EaseDirection));
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

        <div class="ease">
            <label>
                {{ t('particles.ease') }}
                <TaoSelect size="small" :clearable="false" :options="kindOptions" :disabled="isLast" :model-value="kind" @update:model-value="setKind" />
            </label>
            <TaoSegmented size="small" :disabled="!hasDirection" :model-value="hasDirection ? direction : undefined" @update:model-value="setDirection">
                <TaoSegmentedOption v-for="d in EASE_DIRECTIONS" :key="d" :value="d" :label="d" />
            </TaoSegmented>
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

.ease {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.ease > label {
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
