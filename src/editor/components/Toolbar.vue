<script lang="ts" setup>
import { downloadText } from '@1337exp/taoux/file';
import { confirm, TaoButton, TaoSelect, TaoTooltip } from '@1337exp/taoui';
import { computed, nextTick, ref } from 'vue';
import { isLocaleCode, LOCALE_CODES, LOCALE_NAMES, setLocale, useI18n } from '@/i18n';
import { FILE_NAME } from '../file';
import { useEditor } from '../store';

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
    <div class="toolbar">
        <TaoButton size="small" variant="secondary" @click="onNew">{{ t('file.new') }}</TaoButton>
        <TaoButton size="small" variant="secondary" @click="onOpen">{{ t('file.open') }}</TaoButton>
        <TaoButton size="small" variant="secondary" @click="editor.saveProject()">{{ t('file.save') }}</TaoButton>
        <TaoTooltip :content="t('file.exportJson')"><TaoButton size="small" variant="ghost" tone="neutral" @click="downloadText(FILE_NAME, editor.exportText())">JSON</TaoButton></TaoTooltip>
        <input ref="fileInput" type="file" accept=".taofx,.json,application/zip,application/json" hidden @change="onFile" />
        <span class="doc" :title="editor.dirty ? t('file.unsaved') : undefined">
            {{ editor.projectName || t('file.untitled') }}<i v-if="editor.dirty" class="dirty" aria-hidden="true">●</i>
            <span v-if="editor.dirty" class="sr-only">{{ t('file.unsaved') }}</span>
        </span>

        <span class="sep" />

        <TaoTooltip :content="t('history.undo')"><TaoButton size="small" variant="ghost" :disabled="!editor.canUndo" @click="editor.undo()">↶</TaoButton></TaoTooltip>
        <TaoTooltip :content="t('history.redo')"><TaoButton size="small" variant="ghost" :disabled="!editor.canRedo" @click="editor.redo()">↷</TaoButton></TaoTooltip>

        <span class="sep" />

        <TaoButton size="small" variant="secondary" @click="editor.fitView()">{{ t('view.fit') }}</TaoButton>
        <TaoButton size="small" variant="primary" @click="startParticles">{{ t('particles.start') }}</TaoButton>

        <TaoSelect class="lang" size="small" :model-value="locale" :options="languages" :clearable="false" @update:model-value="onLocale" />
    </div>

    <div v-if="editor.notice" class="notice" :class="editor.notice.kind">
        {{ t(editor.notice.key, editor.notice.args) }}
    </div>
</template>

<style scoped>
.toolbar {
    position: absolute;
    top: 12px;
    left: 12px;
    z-index: 10;
    display: flex;
    flex-wrap: wrap; /* в узкой панели нод кнопки уходят на вторую строку, а не обрезаются */
    align-items: center;
    gap: 6px;
    max-width: calc(100% - 24px);
    padding: 6px 10px;
    border: 1px solid var(--tao-color-border, #2a2d33);
    border-radius: 8px;
    background: var(--tao-color-surface, rgba(24, 26, 30, 0.92));
    color: var(--tao-color-text, #d6d9de);
    font-size: 12px;
}

.toolbar :deep(button) {
    white-space: nowrap;
}

.sep {
    width: 1px;
    height: 18px;
    margin: 0 4px;
    background: var(--tao-color-border, #2a2d33);
}

.doc {
    max-width: 160px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--tao-color-text-muted, #8b929c);
}

.dirty {
    margin-left: 4px;
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
    width: 110px;
    margin-left: 6px;
}

.notice {
    position: absolute;
    top: 58px;
    left: 12px;
    z-index: 10;
    max-width: 420px;
    padding: 5px 10px;
    border: 1px solid var(--tao-color-border, #2a2d33);
    border-radius: 8px;
    background: var(--tao-color-surface-raised, rgba(24, 26, 30, 0.95));
    color: var(--tao-color-text, #d6d9de);
    font-size: 12px;
}

.notice.error {
    border-color: var(--tao-color-danger, #7a2e2e);
    color: var(--tao-color-danger, #ff9b9b);
}
</style>
