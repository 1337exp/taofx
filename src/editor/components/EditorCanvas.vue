<script lang="ts" setup>
import { TaoxCanvas } from '@1337exp/taoux/canvas';
import '@1337exp/taoux/canvas.css';
import { fxCanvasHost, fxCanvasOptions } from '../canvasHost';
import { useEditor } from '../store';
import ConnectionsLayer from './ConnectionsLayer.vue';
import NodeView from './NodeView.vue';

const editor = useEditor();
const host = fxCanvasHost(editor);
</script>

<template>
    <TaoxCanvas class="canvas" :host="host" :options="fxCanvasOptions">
        <ConnectionsLayer />
        <NodeView v-for="node in editor.graph.nodes" :key="node.id" :node="node" :selected="editor.selection.has(node.id)" />
    </TaoxCanvas>
</template>

<style scoped>
.canvas {
    --tx-canvas-bg: #15171b;
    --tx-canvas-accent: #4fc3f7;
    --tx-canvas-accent-subtle: rgba(79, 195, 247, 0.12);
}
</style>
