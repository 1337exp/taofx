<script lang="ts" setup>
import { downloadText } from '@1337exp/taoux/file';
import { confirm, TaoButton, TaoSelect, TaoTooltip } from '@1337exp/taoui';
import { computed, nextTick, ref } from 'vue';
import { isLocaleCode, LOCALE_CODES, LOCALE_NAMES, setLocale, useI18n } from '@/i18n';
import { FILE_NAME } from '../file';
import { useEditor } from '../store';

// Верхняя строка оболочки: файл, отмена, название проекта, главное действие области («Экспорт»). Меню из реестра команд
// придёт следующим шагом этапа 4 и займёт место этих кнопок.
const editor = useEditor();
const { t, locale } = useI18n();

const fileInput = ref<HTMLInputElement | null>(null);
const languages = computed(() => LOCALE_CODES.map((code) => ({ value: code, label: LOCALE_NAMES[code] })));

async function onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // чтобы тот же файл можно было открыть повторно
    if (file) await editor.openFile(file);
}

/** Проект живёт в памяти вкладки: перед тем как заменить его, спрашиваем, если есть несохранённое. */
async function canDiscard(): Promise<boolean> {
    if (!editor.dirty) return true;
    return confirm(t('file.discardTitle')).message(t('file.discardMessage')).danger().ok(t('file.discard'));
}

async function onNew() {
    if (await canDiscard()) editor.newProject();
}

async function onOpen() {
    if (await canDiscard()) fileInput.value?.click();
}

async function startParticles() {
    editor.startParticles();
    await nextTick();
    if (editor.takeFitRequest()) editor.fitView();
}

function onLocale(value: string | number | null) {
    if (isLocaleCode(value)) setLocale(value);
}
</script>

<template>
    <header class="top">
        <TaoButton variant="secondary" @click="onNew">{{ t('file.new') }}</TaoButton>
        <TaoButton variant="secondary" @click="onOpen">{{ t('file.open') }}</TaoButton>
        <TaoButton variant="secondary" @click="editor.saveProject()">{{ t('file.save') }}</TaoButton>
        <input ref="fileInput" type="file" accept=".taofx,.json,application/zip,application/json" hidden @change="onFile" />

        <span class="sep" />

        <TaoTooltip :content="t('history.undo')"><TaoButton variant="ghost" tone="neutral" :aria-label="t('history.undo')" :disabled="!editor.canUndo" @click="editor.undo()">↶</TaoButton></TaoTooltip>
        <TaoTooltip :content="t('history.redo')"><TaoButton variant="ghost" tone="neutral" :aria-label="t('history.redo')" :disabled="!editor.canRedo" @click="editor.redo()">↷</TaoButton></TaoTooltip>

        <span class="doc" :title="editor.dirty ? t('file.unsaved') : undefined">
            {{ editor.projectName || t('file.untitled') }}<i v-if="editor.dirty" class="dirty" aria-hidden="true">●</i>
            <span v-if="editor.dirty" class="sr-only">{{ t('file.unsaved') }}</span>
        </span>

        <span class="grow" />

        <TaoButton variant="secondary" @click="startParticles">{{ t('shell.sample') }}</TaoButton>
        <TaoSelect class="lang" :model-value="locale" :options="languages" :clearable="false" @update:model-value="onLocale" />
        <TaoTooltip :content="t('shell.exportHint')"><TaoButton variant="primary" @click="downloadText(FILE_NAME, editor.exportText())">{{ t('shell.export') }}</TaoButton></TaoTooltip>
    </header>
</template>

<style scoped>
.top {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    padding: 6px 12px;
    border-bottom: 1px solid var(--tao-color-border, #222733);
    background: var(--tao-color-surface, #0f121a);
    color: var(--tao-color-text, #d6d9de);
}

.top :deep(button) {
    white-space: nowrap;
}

.sep {
    width: 1px;
    height: 20px;
    margin: 0 4px;
    background: var(--tao-color-border, #2a2d33);
}

.grow {
    flex: 1;
}

.doc {
    max-width: 240px;
    margin-left: 8px;
    overflow: hidden;
    color: var(--tao-color-text-strong, #fff);
    text-overflow: ellipsis;
    white-space: nowrap;
}

.dirty {
    margin-left: 6px;
    color: var(--tao-color-accent, #f0b04a);
    font-style: normal;
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
}

.lang {
    width: 120px;
}
</style>
