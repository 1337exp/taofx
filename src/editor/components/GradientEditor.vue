<script lang="ts" setup>
import { colorModel, TaoButton, TaoColorInput, TaoSlider } from '@1337exp/taoui';
import { patchStop, removeStop, TaoxGradientEditor } from '@1337exp/taoux/gradienteditor';
import '@1337exp/taoux/gradienteditor.css';
import { computed, ref } from 'vue';
import { useI18n } from '@/i18n';
import type { GradientStop } from '@/particles/types';

// Полоса с ручками это модуль taoux; здесь вокруг неё выбор цвета, прозрачность и кнопка на TaoUI.
const props = defineProps<{ modelValue: GradientStop[] }>();
const emit = defineEmits<{ 'update:modelValue': [value: GradientStop[]]; commit: [] }>();
const { t } = useI18n();

const selected = ref(0);
const stop = computed(() => props.modelValue[Math.min(selected.value, props.modelValue.length - 1)]!);

// patchStop из taoux обрезает непрозрачность, t и цвет до разумного числа знаков
function patch(change: Partial<GradientStop>) {
    emit('update:modelValue', patchStop(props.modelValue, selected.value, change));
}

// Цвет в градиенте линейный (массив 0…1), а палитра говорит hex в sRGB: colorModel переводит туда и обратно
const stopColor = computed({ get: () => stop.value.color as number[], set: (c) => patch({ color: c as GradientStop['color'] }) });
const hex = colorModel(stopColor, { format: 'array', range: 1, space: 'linear' });

function onAlpha(value: number | string) {
    patch({ alpha: Number(value) });
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
            <TaoColorInput v-model="hex" size="small" :title="t('particles.stopColor')" @change="emit('commit')" />
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
    --tx-gradient-stop-border: var(--tao-color-border-strong);
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

</style>
