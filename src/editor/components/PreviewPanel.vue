<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { compile } from '@/tsl/compile';
import { useI18n } from '@/i18n';
import { createPreview, type Preview, type Shape } from '@/preview/preview';
import { useEditor } from '../store';

const editor = useEditor();
const { t } = useI18n();

const canvas = ref<HTMLCanvasElement>();
const backend = ref('…');
const shape = ref<Shape>('sphere');
let preview: Preview | null = null;

/** Собирает граф в материал и показывает; ошибки уходят в стор: нода с ошибкой подсвечивается. */
function rebuild() {
    const result = compile(editor.graph, editor.registry);
    editor.setCompileErrors(result.errors);
    if (result.surface) preview?.setSurface(result.surface);
}

// Пересборка по структуре графа: сдвиг нод её не вызывает. Небольшая пауза склеивает серии правок.
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
    () => editor.structureKey,
    () => {
        clearTimeout(timer);
        timer = setTimeout(rebuild, 120);
    },
);
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
    <section class="preview">
        <canvas ref="canvas" />
        <div class="hud">
            <span class="muted">{{ backend }}</span>
            <button :class="{ on: shape === 'sphere' }" @click="shape = 'sphere'">{{ t('preview.sphere') }}</button>
            <button :class="{ on: shape === 'plane' }" @click="shape = 'plane'">{{ t('preview.plane') }}</button>
        </div>
        <ul v-if="editor.compileErrors.length" class="status errors">
            <li class="head">{{ t('preview.errors', [editor.compileErrors.length]) }}</li>
            <li v-for="(e, i) in editor.compileErrors" :key="i">{{ e.nodeId ? `${e.nodeId}: ` : '' }}{{ e.message }}</li>
        </ul>
        <p v-else class="status ok">✔ {{ t('preview.ok') }}</p>
    </section>
</template>

<style scoped>
.preview {
    position: relative;
    min-width: 0;
    height: 100%;
    border-left: 1px solid #222733;
    background: #0b0d12;
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

.muted {
    color: #7b8394;
    font-size: 12px;
}

button {
    padding: 4px 10px;
    border: 1px solid #2c3347;
    border-radius: 6px;
    background: #1b2030;
    color: #d6d9e0;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
}

button.on {
    border-color: #4a62b8;
    background: #2d3a63;
}

.status {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    margin: 0;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    list-style: none;
}

.ok {
    color: #7fd69a;
}

.errors {
    max-height: 40%;
    overflow: auto;
    background: rgba(42, 20, 22, 0.92);
    color: #ff8f8f;
}

.errors .head {
    margin-bottom: 2px;
    font-weight: 600;
}
</style>
