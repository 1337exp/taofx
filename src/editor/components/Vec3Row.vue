<script lang="ts" setup>
import { TaoInputNumber } from '@1337exp/taoui';
import type { Vec3 } from '@/particles/types';

/** Строка «подпись + три числа» для векторов параметров системы. */
const props = withDefaults(defineProps<{ label: string; modelValue: Vec3; step?: number }>(), { step: 0.1 });
const emit = defineEmits<{ 'update:modelValue': [value: Vec3] }>();

function set(i: number, value: number | null) {
    const v = [...props.modelValue] as Vec3;
    v[i] = value ?? 0;
    emit('update:modelValue', v);
}
</script>

<template>
    <div class="row">
        <span>{{ label }}</span>
        <span class="trio"><TaoInputNumber v-for="(v, i) in modelValue" :key="i" size="small" :step="step" :controls="false" :model-value="v" @update:model-value="(x) => set(i, x)" /></span>
    </div>
</template>

<style scoped>
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

.trio {
    display: inline-flex;
    gap: 4px;
}

.trio :deep(.tao-input-number) {
    width: 58px;
}
</style>
