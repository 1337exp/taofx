<script lang="ts" setup>
import { TaoButton, TaoTag } from '@1337exp/taoui';
import { computed } from 'vue';
import type { Constant } from '@/graph/types';
import { useI18n } from '@/i18n';
import { useEditor } from '../store';
import { TYPE_COLORS } from '../values';
import TextureParam from './TextureParam.vue';
import ValueField from './ValueField.vue';

// Инспектор выбранной ноды: что это, её входы (значения тех, что не подключены, правятся здесь) и выходы, с чем соединена,
// ошибка сборки, если она есть.
const props = defineProps<{ nodeId: string }>();

const editor = useEditor();
const { t, nodeTitle, pinLabel } = useI18n();

const node = computed(() => editor.graph.nodes[props.nodeId]);
const def = computed(() => (node.value ? editor.registry.get(node.value.type) : undefined));
const types = computed(() => editor.resolved.nodes[props.nodeId]);
const errors = computed(() => editor.compileErrors.filter((e) => e.nodeId === props.nodeId));

const titleOf = (id: string) => {
    const other = editor.graph.nodes[id];
    const otherDef = other && editor.registry.get(other.type);
    return otherDef ? nodeTitle(otherDef) : id;
};

/** Входы: тип выведен по графу (у `gen` это самый широкий из подключённых), у подключённого названа нода, откуда идёт значение. */
const inputs = computed(() => {
    const d = def.value;
    if (!d) return [];
    return Object.entries(d.inputs).map(([name, pin]) => {
        const from = editor.graph.connections.find((c) => c.to.node === props.nodeId && c.to.pin === name);
        return { name, pin, type: types.value?.inputs[name] ?? 'float', from: from ? `${titleOf(from.from.node)} · ${from.from.pin}` : null };
    });
});

const outputs = computed(() => {
    const d = def.value;
    if (!d) return [];
    return Object.entries(d.outputs).map(([name, pin]) => ({
        name,
        pin,
        type: types.value?.outputs[name] ?? 'float',
        to: editor.graph.connections.filter((c) => c.from.node === props.nodeId && c.from.pin === name).length,
    }));
});

const label = (name: string, fallback?: string) => (def.value ? pinLabel(def.value.id, name, fallback) : name);
const valueOf = (name: string, fallback: Constant | undefined) => node.value?.values[name] ?? fallback;
</script>

<template>
    <div v-if="node && def" class="node-inspector">
        <h3>{{ nodeTitle(def) }}</h3>
        <p class="meta"><code>{{ node.type }}</code> · <code>{{ node.id }}</code></p>

        <ul v-if="errors.length" class="errors">
            <li v-for="(e, i) in errors" :key="i">{{ e.message }}</li>
        </ul>

        <template v-for="(param, key) in def.params" :key="key">
            <TextureParam v-if="param.type === 'texture'" :node="node" :name="String(key)" />
        </template>

        <h4>{{ t('inspector.inputs') }}</h4>
        <div v-for="input in inputs" :key="input.name" class="pin">
            <span class="dot" :style="{ background: TYPE_COLORS[input.type] }" />
            <span class="name">{{ label(input.name, input.pin.label) }}</span>
            <TaoTag size="small">{{ input.type }}</TaoTag>
            <span v-if="input.from" class="from">{{ t('inspector.from', [input.from]) }}</span>
            <ValueField v-else-if="!input.pin.fallback" :type="input.type" :model-value="valueOf(input.name, input.pin.default)" @update:model-value="editor.setValue(node.id, input.name, $event)" />
            <span v-else class="from">{{ t('inspector.byDefault') }}</span>
        </div>

        <h4>{{ t('inspector.outputs') }}</h4>
        <div v-for="output in outputs" :key="output.name" class="pin">
            <span class="dot" :style="{ background: TYPE_COLORS[output.type] }" />
            <span class="name">{{ label(output.name, output.pin.label) }}</span>
            <TaoTag size="small">{{ output.type }}</TaoTag>
            <span class="from">{{ output.to ? t('inspector.links', [output.to]) : t('inspector.unused') }}</span>
        </div>

        <TaoButton class="remove" variant="secondary" tone="danger" @click="editor.removeSelected()">{{ t('inspector.deleteNode') }}</TaoButton>
    </div>
</template>

<style scoped>
.node-inspector {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
}

h3 {
    margin: 0;
    color: var(--tao-color-text-strong, #fff);
    font-size: 15px;
}

h4 {
    margin: 10px 0 2px;
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.meta {
    margin: 0;
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 12px;
}

.pin {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    min-height: 28px;
}

.dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
}

.name {
    flex: 1;
    min-width: 0;
}

.from {
    flex-basis: 100%;
    padding-left: 14px;
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 12px;
}

.errors {
    margin: 0;
    padding: 6px 8px;
    border-radius: var(--tao-radius-control, 8px);
    background: var(--tao-color-danger-subtle, rgba(255, 107, 107, 0.12));
    color: var(--tao-color-danger, #ff8f8f);
    list-style: none;
}

.remove {
    align-self: flex-start;
    margin-top: 12px;
}
</style>
