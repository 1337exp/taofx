<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { createSavedStorage } from '@1337exp/taoux/storage';
import { compile } from '@/graph/compile';
import type { GraphError } from '@/graph/resolve';
import type { Graph } from '@/graph/types';
import { DEMO_GRAPH } from '@/demo';
import { createDefaultRegistry } from '@/nodes';
import { createPreview, type Preview, type Shape } from '@/preview/preview';

const storage = createSavedStorage('taofx.graph');
const registry = createDefaultRegistry();

const text = ref(storage.read() ?? JSON.stringify(DEMO_GRAPH, null, 2));
const errors = ref<string[]>([]);
const backend = ref('…');
const shape = ref<Shape>('sphere');
const canvas = ref<HTMLCanvasElement>();
let preview: Preview | null = null;

function rebuild() {
    let graph: Graph;
    try {
        graph = JSON.parse(text.value) as Graph;
    } catch (e) {
        errors.value = [`JSON: ${e instanceof Error ? e.message : String(e)}`];
        return;
    }

    const result = compile(graph, registry);
    errors.value = result.errors.map((e: GraphError) => (e.nodeId ? `${e.nodeId}: ${e.message}` : e.message));
    if (result.surface && preview) {
        preview.setSurface(result.surface);
        storage.write(text.value);
    }
}

function reset() {
    text.value = JSON.stringify(DEMO_GRAPH, null, 2);
}

let timer: ReturnType<typeof setTimeout> | undefined;
watch(text, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 250);
});
watch(shape, (s) => preview?.setShape(s));

onMounted(async () => {
    preview = await createPreview(canvas.value!);
    backend.value = preview.backend;
    preview.setShape(shape.value);
    rebuild();
});

onBeforeUnmount(() => {
    clearTimeout(timer);
    preview?.dispose();
});
</script>

<template>
    <div class="app">
        <section class="pane">
            <header>
                <strong>taofx</strong>
                <span class="muted">граф (JSON) → TSL → материал</span>
                <button @click="reset">Демо</button>
            </header>
            <textarea v-model="text" spellcheck="false" />
            <ul v-if="errors.length" class="errors">
                <li v-for="(e, i) in errors" :key="i">{{ e }}</li>
            </ul>
            <p v-else class="ok">✔ граф собран</p>
        </section>
        <section class="view">
            <canvas ref="canvas" />
            <div class="hud">
                <span class="muted">{{ backend }}</span>
                <button :class="{ on: shape === 'sphere' }" @click="shape = 'sphere'">Сфера</button>
                <button :class="{ on: shape === 'plane' }" @click="shape = 'plane'">Плоскость</button>
            </div>
        </section>
    </div>
</template>

<style>
html,
body,
#app {
    height: 100%;
    margin: 0;
}

body {
    background: #0b0d12;
    color: #d6d9e0;
    font: 14px/1.4 system-ui, sans-serif;
}

.app {
    display: grid;
    grid-template-columns: minmax(320px, 40%) 1fr;
    height: 100%;
}

.pane {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border-right: 1px solid #222733;
    min-width: 0;
}

.pane header {
    display: flex;
    align-items: center;
    gap: 12px;
}

.pane header button {
    margin-left: auto;
}

textarea {
    flex: 1;
    resize: none;
    background: #10131a;
    color: #c8d0e0;
    border: 1px solid #222733;
    border-radius: 6px;
    padding: 8px;
    font: 12px/1.45 ui-monospace, Consolas, monospace;
    tab-size: 2;
}

.errors {
    margin: 0;
    padding: 8px 8px 8px 24px;
    max-height: 30%;
    overflow: auto;
    color: #ff8f8f;
    background: #2a1416;
    border-radius: 6px;
}

.ok {
    margin: 0;
    color: #7fd69a;
}

.muted {
    color: #7b8394;
}

.view {
    position: relative;
    min-width: 0;
}

canvas {
    display: block;
    width: 100%;
    height: 100%;
}

.hud {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
}

button {
    background: #1b2030;
    color: inherit;
    border: 1px solid #2c3347;
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
}

button.on {
    background: #2d3a63;
    border-color: #4a62b8;
}
</style>
