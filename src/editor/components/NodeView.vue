<script lang="ts" setup>
import { usePinMeasure } from '@1337exp/taoux/pins';
import { computed, ref } from 'vue';
import type { Constant, NodeInstance } from '@/graph/types';
import { useI18n } from '@/i18n';
import { useEditor } from '../store';
import { TYPE_COLORS } from '../values';
import ValueField from './ValueField.vue';

const props = defineProps<{ node: NodeInstance; selected: boolean }>();

const editor = useEditor();
const { nodeTitle, pinLabel } = useI18n();

const def = computed(() => editor.registry.get(props.node.type)!);
const types = computed(() => editor.resolved.nodes[props.node.id]);
const category = computed(() => props.node.type.split('/')[0]);
const failed = computed(() => editor.compileErrors.some((e) => e.nodeId === props.node.id));

// Типы пинов выведены по графу: у `gen`-пина это самый широкий из подключённых, поэтому цвет и поле значения следуют за ними.
const inputs = computed(() =>
    Object.entries(def.value.inputs).map(([name, pin]) => ({ name, pin, type: types.value?.inputs[name] ?? 'float' })),
);
const outputs = computed(() =>
    Object.entries(def.value.outputs).map(([name, pin]) => ({ name, pin, type: types.value?.outputs[name] ?? 'float' })),
);

const label = (name: string, fallback?: string) => pinLabel(def.value.id, name, fallback);
const valueOf = (name: string, fallback: Constant | undefined) => props.node.values[name] ?? fallback;

//--------------------------------------------------
// Позиции пинов нужны слою связей: меряем по DOM и храним в мировых единицах (taoux/pins).

const el = ref<HTMLElement | null>(null);

usePinMeasure(el, {
    zoom: () => editor.camera.z,
    report: (offsets) => editor.setPinOffsets(props.node.id, offsets),
    clear: () => editor.clearPinOffsets(props.node.id),
});
</script>

<template>
    <div
        ref="el"
        class="node"
        :class="[`cat-${category}`, { selected, failed }]"
        :data-node-id="node.id"
        :style="{ transform: `translate(${node.x}px, ${node.y}px)` }"
    >
        <header class="title">{{ nodeTitle(def) }}</header>

        <div class="body">
            <div class="column inputs">
                <div v-for="input in inputs" :key="input.name" class="pin-row">
                    <span class="pin" :style="{ '--pin-color': TYPE_COLORS[input.type] }" data-dir="in" :data-pin="input.name" />
                    <span class="pin-label">{{ label(input.name, input.pin.label) }}</span>
                    <ValueField
                        v-if="!editor.isConnected(node.id, input.name, 'in')"
                        :type="input.type"
                        :model-value="valueOf(input.name, input.pin.default)"
                        @update:model-value="editor.setValue(node.id, input.name, $event)"
                    />
                </div>
            </div>

            <div class="column outputs">
                <div v-for="output in outputs" :key="output.name" class="pin-row out">
                    <span class="pin-label">{{ label(output.name, output.pin.label) }}</span>
                    <span class="pin" :style="{ '--pin-color': TYPE_COLORS[output.type] }" data-dir="out" :data-pin="output.name" />
                </div>
            </div>
        </div>
    </div>
</template>

<style scoped>
.node {
    --head-a: #3a4a63;
    --head-b: #2c3850;
    position: absolute;
    top: 0;
    left: 0;
    min-width: 150px;
    border: 1px solid #2a2d33;
    border-radius: 6px;
    background: rgba(24, 26, 30, 0.96);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5);
    font-size: 12px;
    color: #d6d9de;
    cursor: move;
    user-select: none;
}

.node.cat-input { --head-a: #2f5d7c; --head-b: #244860; }
.node.cat-const { --head-a: #2f6b62; --head-b: #24534c; }
.node.cat-math { --head-a: #4a4f5a; --head-b: #393d46; }
.node.cat-noise { --head-a: #6a4a86; --head-b: #523a68; }
.node.cat-output { --head-a: #7a5a2c; --head-b: #604622; }

.node.selected {
    border-color: #ffca00;
    box-shadow: 0 0 0 1px #ffca00, 0 4px 12px rgba(0, 0, 0, 0.5);
}

.node.failed {
    border-color: #ff5252;
    box-shadow: 0 0 0 2px #ff5252, 0 0 16px rgba(255, 82, 82, 0.5);
}

.title {
    padding: 4px 10px;
    border-radius: 5px 5px 0 0;
    background: linear-gradient(var(--head-a), var(--head-b));
    font-weight: 600;
}

.body {
    display: flex;
    justify-content: space-between;
    gap: 24px;
    padding: 6px 0;
}

.column {
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.pin-row {
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 20px;
}

.inputs .pin-row {
    padding-right: 10px;
    margin-left: -6px;
}

.outputs .pin-row {
    padding-left: 10px;
    margin-right: -6px;
}

.pin {
    flex: none;
    width: 14px;
    height: 14px;
    box-sizing: border-box;
    border: 2px solid var(--pin-color, #888);
    border-radius: 50%;
    background: #15171a;
    cursor: crosshair;
}
</style>
