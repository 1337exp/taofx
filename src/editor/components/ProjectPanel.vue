<script lang="ts" setup>
import { TaoDropdownMenu, TaoEmpty, TaoIcon, TaoTree } from '@1337exp/taoui';
import { computed, ref, watch } from 'vue';
import { useI18n } from '@/i18n';
import { COMMAND } from '../commands';
import { buildProjectTree, collapsedAfter, openFolders } from '../projectTree';
import { useEditorCommands } from '../shellCommands';
import { useEditor } from '../store';
import { ui } from '../ui';

// «Проект»: дерево ресурсов открытого проекта по их путям (docs/design.ru.md). Клик по документу открывает его, F2
// переименовывает, Delete удаляет (с перечнем тех, кто на него ссылается), «+» добавляет новое, а файлы можно бросить в окно.
const editor = useEditor();
const { t } = useI18n();
const { commands } = useEditorCommands();

const nodes = computed(() => {
    void editor.projectRevision; // файлы проекта меняются мимо реактивности: перестраиваем по счётчику
    return buildProjectTree(editor.project.resources);
});

/** Папки открыты по умолчанию, помнится только то, что пользователь свернул: так новая папка (первая картинка) открыта сразу. */
const collapsed = ref<ReadonlySet<string>>(new Set());
const open = computed(() => openFolders(nodes.value, collapsed.value));
const onExpanded = (expanded: string[]) => (collapsed.value = collapsedAfter(nodes.value, expanded));

// выбранным в дереве становится документ на экране (при открытии, создании, удалении)
watch(
    () => editor.activeDocId,
    (id) => {
        if (id !== null) ui.selectedResource = id;
    },
    { immediate: true },
);

const isFolder = (id: string) => id.startsWith('dir:');

function onSelect(node: { id: string }) {
    if (isFolder(node.id)) return;
    ui.selectedResource = node.id;
    const resource = editor.project.find(node.id);
    editor.setSelection([]); // выбрана строка дерева: выбор нод в графе больше не главный для инспектора
    // документ открывается предпросмотром (вкладка курсивом, её место займёт следующий предпросмотр); картинка только выбирается
    if (resource?.type === 'doc') editor.openDocument(node.id, true);
}

/** Двойной клик по документу закрепляет его вкладку (первый клик уже открыл и выбрал его). */
function onDoubleClick() {
    if (ui.selectedResource !== null) editor.pinTab(ui.selectedResource);
}

function onKeydown(event: KeyboardEvent) {
    if (event.key === 'F2') {
        event.preventDefault();
        commands.run(COMMAND.resourceRename);
    } else if (event.key === 'Delete') {
        event.preventDefault();
        commands.run(COMMAND.resourceDelete);
    }
}

/** Меню «+»: то, что добавляет в проект. Строится из реестра, поэтому следует за языком и состоянием. */
const addMenu = computed(() => commands.toMenu([COMMAND.newEffect, COMMAND.newMaterial, COMMAND.newFlipbook, '-', COMMAND.import]));

/** Меню строки: переименовать и удалить; выбор переносится на строку, потому что команды работают на выбранном. */
const rowMenu = computed(() => [
    { id: COMMAND.resourceRename, label: t('project.rename') },
    { id: COMMAND.resourceDelete, label: t('project.delete') },
]);
function onRowMenu(nodeId: string, commandId: string | number) {
    ui.selectedResource = nodeId;
    commands.run(String(commandId));
}
const run = (id: string | number) => commands.run(String(id));
</script>

<template>
    <section class="panel" @keydown="onKeydown" @dblclick="onDoubleClick">
        <header>
            <span class="title">{{ t('shell.project') }}</span>
            <span class="name" :title="editor.projectName">{{ editor.projectName || t('file.untitled') }}</span>
            <TaoDropdownMenu :items="addMenu" :menu-label="t('project.add')" @select="run">
                <template #icon><TaoIcon name="tao-plus" /></template>
            </TaoDropdownMenu>
        </header>
        <div class="body">
            <TaoTree
                v-if="nodes.length"
                :nodes="nodes"
                :expanded="open"
                :selected="ui.selectedResource"
                :aria-label="t('shell.project')"
                @update:expanded="onExpanded"
                @select="onSelect"
            >
                <template #actions="{ node }">
                    <TaoDropdownMenu v-if="!isFolder(node.id)" :items="rowMenu" size="small" :menu-label="t('project.actions')" @select="(id) => onRowMenu(node.id, id)" />
                </template>
            </TaoTree>
            <TaoEmpty v-else :title="t('shell.emptyTitle')">{{ t('shell.emptyProject') }}</TaoEmpty>
            <p v-if="editor.openDocId === null" class="hint">{{ t('shell.notInProject') }}</p>
        </div>
    </section>
</template>

<style scoped>
.panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--tao-color-surface, #0f121a);
    color: var(--tao-color-text, #d6d9e0);
}

header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 2px 12px;
}

.title {
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--tao-color-text-strong, #fff);
    font-size: 12px;
    text-align: right;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 4px 8px 8px;
}

.hint {
    margin: 8px 4px 0;
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 12px;
}
</style>
