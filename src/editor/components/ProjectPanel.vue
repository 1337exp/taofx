<script lang="ts" setup>
import { TaoEmpty, TaoTree } from '@1337exp/taoui';
import { computed, ref } from 'vue';
import { useI18n } from '@/i18n';
import { buildProjectTree } from '../projectTree';
import { useEditor } from '../store';

// «Проект»: дерево ресурсов открытого проекта по их путям. Пока только показ (открытие, создание и перенос приходят
// следующим шагом этапа 4): главное, что видно, с чем работаем.
const editor = useEditor();
const { t } = useI18n();

const nodes = computed(() => {
    void editor.projectRevision; // файлы проекта меняются мимо реактивности: перестраиваем по счётчику
    return buildProjectTree(editor.project.resources);
});

/** Папки открыты по умолчанию: проект маленький, и дерево сразу показывает всё. */
const expanded = ref<string[]>([]);
const open = computed(() => {
    const all: string[] = [];
    const walk = (list: typeof nodes.value) => list.forEach((n) => n.children && (all.push(n.id), walk(n.children)));
    walk(nodes.value);
    return [...new Set([...all, ...expanded.value])];
});
</script>

<template>
    <section class="panel">
        <header>
            <span class="title">{{ t('shell.project') }}</span>
            <span class="name" :title="editor.projectName">{{ editor.projectName || t('file.untitled') }}</span>
        </header>
        <div class="body">
            <TaoTree v-if="nodes.length" :nodes="nodes" :expanded="open" :selected="editor.openDocId" :aria-label="t('shell.project')" @update:expanded="expanded = $event" />
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
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 12px 4px;
}

.title {
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.name {
    overflow: hidden;
    color: var(--tao-color-text-strong, #fff);
    font-size: 12px;
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
