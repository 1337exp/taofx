<script lang="ts" setup>
import { TaoButton } from '@1337exp/taoui';
import { computed, ref } from 'vue';
import { useI18n } from '@/i18n';
import type { GradientStop } from '@/particles/types';
import { addStop, gradientCss, moveStop, removeStop } from '../curveOps';
import { fromHex, toHex } from '../values';

const props = defineProps<{ modelValue: GradientStop[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: GradientStop[]]; commit: [] }>();
const { t } = useI18n();

const bar = ref<HTMLElement | null>(null);
const selected = ref(0);
const stop = computed(() => props.modelValue[Math.min(selected.value, props.modelValue.length - 1)]!);

// Цвет в градиенте линейный, а выбор цвета у браузера sRGB: переводим туда и обратно
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hex = computed(() => toHex(stop.value.color.map(toSrgb)));

function tAt(e: PointerEvent | MouseEvent): number {
    const r = bar.value!.getBoundingClientRect();
    return (e.clientX - r.left) / r.width;
}

let dragging = -1;

function onStopDown(e: PointerEvent, i: number) {
    if (e.altKey) {
        emit('update:modelValue', removeStop(props.modelValue, i));
        selected.value = 0;
        emit('commit');
        return;
    }
    selected.value = i;
    dragging = i;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
}

function onMove(e: PointerEvent) {
    if (dragging >= 0) emit('update:modelValue', moveStop(props.modelValue, dragging, tAt(e)));
}

function onUp() {
    if (dragging < 0) return;
    dragging = -1;
    emit('commit');
}

function onBarClick(e: MouseEvent) {
    if (e.target !== bar.value) return;
    const r = addStop(props.modelValue, tAt(e));
    emit('update:modelValue', r.stops);
    selected.value = r.index;
    emit('commit');
}

function patchStop(patch: Partial<GradientStop>) {
    emit('update:modelValue', props.modelValue.map((s, i) => (i === selected.value ? { ...s, ...patch } : s)));
}

function onColor(e: Event) {
    const rgb = fromHex((e.target as HTMLInputElement).value);
    if (rgb) patchStop({ color: rgb.map(toLinear) as GradientStop['color'] });
}

function onAlpha(e: Event) {
    patchStop({ alpha: Math.min(1, Math.max(0, Number((e.target as HTMLInputElement).value))) });
}
</script>

<template>
    <div class="gradient">
        <div ref="bar" class="bar" :style="{ backgroundImage: gradientCss(modelValue) }" :title="t('particles.gradientHint')" @click="onBarClick">
            <span
                v-for="(s, i) in modelValue"
                :key="i"
                class="stop"
                :class="{ on: i === selected }"
                :style="{ left: `${s.t * 100}%` }"
                @pointerdown.stop="onStopDown($event, i)"
                @pointermove="onMove"
                @pointerup="onUp"
                @pointercancel="onUp"
            />
        </div>
        <div class="fields">
            <input type="color" :value="hex" :title="t('particles.stopColor')" @input="onColor" @change="emit('commit')" />
            <label>{{ t('particles.stopAlpha') }}
                <input type="range" min="0" max="1" step="0.01" :value="stop.alpha" @input="onAlpha" @change="emit('commit')" />
            </label>
            <TaoButton size="small" variant="ghost" :disabled="modelValue.length <= 1" :aria-label="t('particles.removeStop')" @click="emit('update:modelValue', removeStop(modelValue, selected)); selected = 0; emit('commit')">✕</TaoButton>
        </div>
    </div>
</template>

<style scoped>
.bar {
    position: relative;
    height: 22px;
    border: 1px solid #2c3347;
    border-radius: 4px;
    /* шахматка под полосой показывает прозрачность */
    background-color: #fff;
    background-size: 100% 100%, 12px 12px;
    cursor: crosshair;
}

.stop {
    position: absolute;
    top: 14px;
    width: 10px;
    height: 12px;
    margin-left: -5px;
    border: 2px solid #8b929c;
    border-radius: 2px;
    background: #0b0d12;
    cursor: grab;
}

.stop.on {
    border-color: #4fc3f7;
}

.fields {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
    font-size: 12px;
}

.fields label {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 6px;
}

.fields input[type='range'] {
    flex: 1;
    min-width: 0;
}

.fields input[type='color'] {
    width: 34px;
    height: 22px;
    padding: 0;
    border: 1px solid #333;
    border-radius: 3px;
    background: none;
}
</style>
