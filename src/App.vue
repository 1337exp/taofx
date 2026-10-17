<script lang="ts" setup>
import { TaoSplit } from '@1337exp/taoui';
import { defineAsyncComponent, onMounted, onUnmounted } from 'vue';
import { layout } from '@/editor/layout';
import EditorCanvas from '@/editor/components/EditorCanvas.vue';
import NodePalette from '@/editor/components/NodePalette.vue';
import Toolbar from '@/editor/components/Toolbar.vue';
import { useEditor } from '@/editor/store';

// Превью тянет за собой three (WebGPU) и компилятор TSL, это больше половины сборки: грузим после того, как редактор уже показан
const PreviewPanel = defineAsyncComponent(() => import('@/editor/components/PreviewPanel.vue'));

const editor = useEditor();

// В свёрнутом состоянии сплит отдаёт нодам 0: размер запоминаем только у открытой панели
function onSize(value: number) {
    if (layout.nodesOpen) layout.nodesSize = value;
}

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
    <TaoSplit
        class="app"
        :model-value="layout.nodesOpen ? layout.nodesSize : 0"
        :min="layout.nodesOpen ? 20 : 0"
        :min-end="20"
        :resizable="layout.nodesOpen"
        @update:model-value="onSize"
    >
        <template #start>
            <div class="editor">
                <EditorCanvas />
                <Toolbar />
                <NodePalette />
            </div>
        </template>
        <template #end>
            <PreviewPanel />
        </template>
    </TaoSplit>
</template>

<style>
html,
body,
#app {
    height: 100%;
    margin: 0;
}

body {
    background: var(--tao-color-bg, #0b0d12);
    color: var(--tao-color-text, #d6d9e0);
    font: 14px/1.4 system-ui, sans-serif;
}

* {
    box-sizing: border-box;
}
</style>

<style scoped>
.app {
    height: 100%;
}

.editor {
    position: relative;
    min-width: 0;
    height: 100%;
}
</style>
