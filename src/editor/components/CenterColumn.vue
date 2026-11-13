<script lang="ts" setup>
import { TaoDocTabs, TaoSegmented, TaoSegmentedOption, TaoSplit, type TaoDocTab } from '@1337exp/taoui';
import { computed, defineAsyncComponent } from 'vue';
import { useI18n } from '@/i18n';
import { layout } from '../layout';
import { useEditor } from '../store';
import BottomPanel from './BottomPanel.vue';
import FlipbookView from './FlipbookView.vue';
import GraphView from './GraphView.vue';
import Timeline from './Timeline.vue';

// Превью тянет за собой three (WebGPU) и компилятор TSL, это больше половины сборки: грузим после того, как оболочка показана
const PreviewPanel = defineAsyncComponent(() => import('./PreviewPanel.vue'));

const editor = useEditor();
const { t } = useI18n();

/** Вкладка документа, у которого ещё нет файла в проекте (заготовка при запуске, правленный новый): закрыть её нельзя, она единственная. */
const DRAFT = '__draft';

// Вкладки открытых документов: подпись это имя файла без `.json` (так видно и вид документа), подсказка путь
const items = computed<TaoDocTab[]>(() => {
    void editor.projectRevision; // файлы проекта меняются мимо реактивности: имена берём по счётчику
    const list: TaoDocTab[] = editor.tabs.map((tab) => {
        const resource = editor.project.find(tab.docId);
        return {
            value: tab.docId,
            label: resource ? resource.path.slice(resource.path.lastIndexOf('/') + 1).replace(/\.json$/, '') : tab.docId,
            title: resource?.path,
            preview: tab.preview,
            dirty: tab.docId === editor.openDocId ? editor.docDirty : tab.dirty,
        };
    });
    if (editor.draftTab) list.push({ value: DRAFT, label: editor.projectName || t('file.untitled'), closable: false, dirty: editor.docDirty });
    return list;
});
const active = computed(() => editor.activeDocId ?? DRAFT);

const onSelect = (value: string) => (value === DRAFT ? editor.showScene() : editor.openDocument(value));
const onReorder = (from: number, to: number) => {
    const count = editor.tabs.length; // у черновика (он последний и не в списке вкладок) места не меняют
    if (from < count && to < count) editor.moveTab(from, to);
};

const view = computed({
    get: () => layout.view,
    set: (value: string) => (layout.view = value === 'graph' ? 'graph' : 'preview'),
});
</script>

<template>
    <div class="center">
        <div class="docbar">
            <TaoDocTabs class="tabs" :model-value="active" :items="items" @update:model-value="onSelect" @close="editor.closeTab" @pin="editor.pinTab" @reorder="onReorder" />
            <TaoSegmented v-show="editor.activeFlipbookId === null" v-model="view" :aria-label="t('shell.views')">
                <TaoSegmentedOption value="preview" :label="t('shell.preview')" />
                <TaoSegmentedOption value="graph" :label="t('shell.graph')" />
            </TaoSegmented>
        </div>
        <FlipbookView v-if="editor.activeFlipbookId !== null" />
        <TaoSplit v-show="editor.activeFlipbookId === null" v-model="layout.stage" direction="column" class="grow" :min="25" :min-end="10" @change="(v: number) => (layout.stage = v)">
            <template #start>
                <div class="stage">
                    <!-- Превью остаётся в памяти под графом: заново поднимать WebGPU при каждом переключении дорого -->
                    <div v-show="layout.view === 'preview'" class="view"><PreviewPanel /></div>
                    <div v-if="layout.view === 'graph'" class="view"><GraphView /></div>
                    <Timeline />
                </div>
            </template>
            <template #end>
                <BottomPanel />
            </template>
        </TaoSplit>
    </div>
</template>

<style scoped>
.center {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    background: var(--tao-color-surface, #0f121a);
}

.docbar {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding-right: 8px;
    border-bottom: 1px solid var(--tao-color-border, #222733);
}

.tabs {
    flex: 1;
    min-width: 0;
}

.grow {
    flex: 1;
    min-height: 0;
}

.stage {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
}

.view {
    flex: 1;
    min-height: 0;
}
</style>
