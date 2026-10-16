<script lang="ts" setup>
import { computed } from 'vue';
import type { Constant, DataType } from '@/graph/types';
import { fromHex, parseNumber, partsOf, toHex, valueOfParts } from '../values';

const props = defineProps<{ type: DataType; modelValue: Constant | undefined }>();
const emit = defineEmits<{ 'update:modelValue': [value: Constant] }>();

const parts = computed(() => partsOf(props.type, props.modelValue));

function onNumber(index: number, e: Event) {
    const next = [...parts.value];
    next[index] = parseNumber((e.target as HTMLInputElement).value);
    emit('update:modelValue', valueOfParts(props.type, next));
}

function onColor(e: Event) {
    const rgb = fromHex((e.target as HTMLInputElement).value);
    if (rgb) emit('update:modelValue', rgb);
}
</script>

<template>
    <input v-if="type === 'color'" class="swatch" type="color" :value="toHex(parts)" @input="onColor" />
    <span v-else class="numbers">
        <input
            v-for="(part, i) in parts"
            :key="i"
            class="field"
            type="number"
            step="any"
            :value="part"
            @input="onNumber(i, $event)"
        />
    </span>
</template>

<style scoped>
.numbers {
    display: inline-flex;
    gap: 2px;
}

.field {
    width: 46px;
    padding: 1px 3px;
    border: 1px solid #333;
    border-radius: 3px;
    background: #101214;
    color: inherit;
    font: inherit;
}

.swatch {
    width: 34px;
    height: 20px;
    padding: 0;
    border: 1px solid #333;
    border-radius: 3px;
    background: none;
    cursor: pointer;
}
</style>
