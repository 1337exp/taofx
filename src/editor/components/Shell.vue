<script lang="ts" setup>
import { TaoSplit } from '@1337exp/taoui';
import { ref } from 'vue';
import { useI18n } from '@/i18n';
import { layout } from '../layout';
import { useEditor } from '../store';
import CenterColumn from './CenterColumn.vue';
import InspectorPanel from './InspectorPanel.vue';
import LayersPanel from './LayersPanel.vue';
import ProjectPanel from './ProjectPanel.vue';
import RenameDialog from './RenameDialog.vue';
import { useEditorCommands } from '../shellCommands';
import StatusBar from './StatusBar.vue';
import Toolbar from './Toolbar.vue';

// Оболочка редактора (docs/design.ru.md): верхняя строка, слева «Проект» и «Слои», в центре вид документа с таймлайном и
// нижней панелью, справа «Инспектор», внизу статус-строка. Размеры областей запоминаются (`layout`).
const editor = useEditor();
const { t } = useI18n();
const { dropFiles } = useEditorCommands();

// Файлы можно бросить в любое место окна: картинки и `.json` попадают в проект, `.taofx` открывается. Без этого браузер
// ушёл бы на брошенный файл, потеряв проект. Счётчик нужен, потому что dragenter и dragleave приходят от каждого вложенного элемента.
const dragDepth = ref(0);
const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
function onDragEnter(e: DragEvent) {
    if (hasFiles(e)) dragDepth.value++;
}
function onDragLeave(e: DragEvent) {
    if (hasFiles(e) && dragDepth.value > 0) dragDepth.value--;
}
function onDrop(e: DragEvent) {
    dragDepth.value = 0;
    if (hasFiles(e)) void dropFiles([...(e.dataTransfer?.files ?? [])]);
}
</script>

<template>
    <div class="shell" @dragenter.prevent="onDragEnter" @dragover.prevent @dragleave="onDragLeave" @drop.prevent="onDrop">
        <Toolbar />
        <TaoSplit v-model="layout.left" class="main" :min="8" :max="40" :min-end="40" @change="(v: number) => (layout.left = v)">
            <template #start>
                <TaoSplit v-model="layout.leftStage" direction="column" class="fill" :min="15" :min-end="15" @change="(v: number) => (layout.leftStage = v)">
                    <template #start><ProjectPanel /></template>
                    <template #end><LayersPanel /></template>
                </TaoSplit>
            </template>
            <template #end>
                <TaoSplit v-model="layout.center" class="fill" :min="30" :max="92" :min-end="8" @change="(v: number) => (layout.center = v)">
                    <template #start><CenterColumn /></template>
                    <template #end><InspectorPanel /></template>
                </TaoSplit>
            </template>
        </TaoSplit>
        <StatusBar />
        <RenameDialog />
        <div v-if="dragDepth > 0" class="drop" aria-hidden="true">{{ t('project.dropHint') }}</div>
        <p v-if="editor.notice" class="notice" :class="editor.notice.kind" role="status">{{ t(editor.notice.key, editor.notice.args) }}</p>
    </div>
</template>

<style scoped>
.shell {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
}

.main {
    flex: 1;
    min-height: 0;
}

.fill {
    height: 100%;
}

/* Сообщение на несколько секунд (результат открытия, сохранения): над статус-строкой, не двигает области */
.notice {
    position: absolute;
    left: 50%;
    bottom: 36px;
    z-index: 20;
    max-width: 560px;
    margin: 0;
    padding: 6px 12px;
    border: 1px solid var(--tao-color-border, #2a2d33);
    border-radius: var(--tao-radius-control, 8px);
    background: var(--tao-color-surface, #181a1e);
    color: var(--tao-color-text, #d6d9de);
    font-size: 13px;
    transform: translateX(-50%);
}

/* Пока над окном тянут файл: подсказка поверх всего, события мыши она не ловит */
.drop {
    position: absolute;
    inset: 8px;
    z-index: 30;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px dashed var(--tao-color-accent, #f0b04a);
    border-radius: var(--tao-radius-panel, 12px);
    background: var(--tao-color-overlay, rgba(0, 0, 0, 0.55));
    color: var(--tao-color-text-strong, #fff);
    font-size: 16px;
    pointer-events: none;
}

.notice.error {
    border-color: var(--tao-color-danger, #ff6b6b);
    color: var(--tao-color-danger, #ff8f8f);
}
</style>
