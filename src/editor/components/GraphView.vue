<script lang="ts" setup>
import { TaoButton } from '@1337exp/taoui';
import { nextTick, onMounted } from 'vue';
import { useI18n } from '@/i18n';
import { useEditor } from '../store';
import EditorCanvas from './EditorCanvas.vue';
import NodePalette from './NodePalette.vue';

// Граф материала как вид документа (вкладка «Граф»): холст нод, палитра и своя панель кнопок.
const editor = useEditor();
const { t } = useI18n();

// Размер холста известен, только когда граф на экране: если документ открыли, пока был виден другой вид, камера подбирается здесь.
onMounted(async () => {
    await nextTick();
    if (editor.takeGraphFit()) editor.fitView();
});
</script>

<template>
    <div class="graph">
        <EditorCanvas />
        <div class="hud">
            <TaoButton variant="ghost" tone="neutral" @click="editor.fitView()">{{ t('shell.graphFit') }}</TaoButton>
        </div>
        <NodePalette />
    </div>
</template>

<style scoped>
.graph {
    position: relative;
    min-width: 0;
    height: 100%;
}

.hud {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 5;
    padding: 4px;
    border-radius: var(--tao-radius-control, 8px);
    background: var(--tao-color-surface, rgba(15, 18, 26, 0.85));
}
</style>
