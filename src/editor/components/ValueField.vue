<script lang="ts" setup>
import { colorModel, TaoColorInput } from '@1337exp/taoui';
import { computed } from 'vue';
import type { Constant, DataType } from '@/graph/types';
import { parseNumber, partsOf, valueOfParts } from '../values';

const props = defineProps<{ type: DataType; modelValue: Constant | undefined }>();
const emit = defineEmits<{ 'update:modelValue': [value: Constant] }>();

const parts = computed(() => partsOf(props.type, props.modelValue));

function onNumber(index: number, e: Event) {
    const next = [...parts.value];
    next[index] = parseNumber((e.target as HTMLInputElement).value);
    emit('update:modelValue', valueOfParts(props.type, next));
}

// Цвет ноды это массив 0…1 (как есть, без управления цветом); палитра говорит hex
const colorParts = computed({ get: () => parts.value, set: (c) => emit('update:modelValue', c) });
const hex = colorModel(colorParts, { format: 'array', range: 1 });
</script>

<template>
    <TaoColorInput v-if="type === 'color'" v-model="hex" size="small" class="swatch" />
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

</style>
