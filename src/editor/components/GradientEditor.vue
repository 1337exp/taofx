<script lang="ts" setup>
import { TaoButton, TaoSlider } from '@1337exp/taoui';
import { TaoxGradientEditor } from '@1337exp/taoux/gradienteditor';
import '@1337exp/taoux/gradienteditor.css';
import { computed, ref } from 'vue';
import { useI18n } from '@/i18n';
import type { GradientStop } from '@/particles/types';
import { removeStop, toLinear, toSrgb } from '../curveOps';
import { fromHex, toHex } from '../values';

// Полоса с ручками это модуль taoux; здесь вокруг неё выбор цвета, прозрачность и кнопка на TaoUI.
const props = defineProps<{ modelValue: GradientStop[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: GradientStop[]]; commit: [] }>();
const { t } = useI18n();

const selected = ref(0);
const stop = computed(() => props.modelValue[Math.min(selected.value, props.modelValue.length - 1)]!);

// Цвет в градиенте линейный, а выбор цвета у браузера sRGB: переводим туда и обратно
const hex = computed(() => toHex(stop.value.color.map(toSrgb)));

function patchStop(patch: Partial<GradientStop>) {
    emit('update:modelValue', props.modelValue.map((s, i) => (i === selected.value ? { ...s, ...patch } : s)));
}

function onColor(e: Event) {
    const rgb = fromHex((e.target as HTMLInputElement).value);
    if (rgb) patchStop({ color: rgb.map(toLinear) as GradientStop['color'] });
}

function onAlpha(value: number | string) {
    patchStop({ alpha: Math.min(1, Math.max(0, Number(value))) });
}

function remove() {
    emit('update:modelValue', removeStop(props.modelValue, selected.value));
    selected.value = 0;
    emit('commit');
}
</script>

<template>
    <div class="gradient">
        <TaoxGradientEditor
            :model-value="modelValue"
            v-model:selected="selected"
            :hint="t('particles.gradientHint')"
            @update:model-value="(v) => emit('update:modelValue', v)"
            @commit="emit('commit')"
        />
        <div class="fields">
            <input type="color" :value="hex" :title="t('particles.stopColor')" @input="onColor" @change="emit('commit')" />
            <label>{{ t('particles.stopAlpha') }}
                <TaoSlider variant="thin" size="small" :min="0" :max="1" :step="0.01" :model-value="stop.alpha" @update:model-value="onAlpha" @change="emit('commit')" />
            </label>
            <TaoButton size="small" variant="ghost" :disabled="modelValue.length <= 1" :aria-label="t('particles.removeStop')" @click="remove">✕</TaoButton>
        </div>
    </div>
</template>

<style scoped>
.gradient {
    --tx-gradient-border: var(--tao-color-border);
    --tx-gradient-stop-border: var(--tao-color-text-muted);
    --tx-gradient-stop-bg: var(--tao-color-surface-sunken);
    --tx-gradient-accent: var(--tao-color-accent);
}

.fields {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
}

.fields label {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 6px;
}

.fields label :deep(.tao-slider) {
    flex: 1;
    min-width: 0;
}

.fields input[type='color'] {
    width: 34px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--tao-color-border);
    border-radius: 3px;
    background: none;
}
</style>
