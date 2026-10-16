<script lang="ts" setup>
import { onMounted, onUnmounted } from 'vue';
import EditorCanvas from '@/editor/components/EditorCanvas.vue';
import NodePalette from '@/editor/components/NodePalette.vue';
import PreviewPanel from '@/editor/components/PreviewPanel.vue';
import Toolbar from '@/editor/components/Toolbar.vue';
import { useEditor } from '@/editor/store';

const editor = useEditor();

let stopAutosave: (() => void) | null = null;

onMounted(() => {
    // Сохранённый граф поднимаем, иначе остаётся демо; в обоих случаях показываем его целиком.
    const restored = editor.restoreSaved();
    stopAutosave = editor.startAutosave();
    if (!restored) editor.fitView();
});

onUnmounted(() => stopAutosave?.());
</script>

<template>
    <div class="app">
        <div class="editor">
            <EditorCanvas />
            <Toolbar />
            <NodePalette />
        </div>
        <PreviewPanel />
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

* {
    box-sizing: border-box;
}
</style>

<style scoped>
.app {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(320px, 38%);
    height: 100%;
}

.editor {
    position: relative;
    min-width: 0;
    height: 100%;
}
</style>
