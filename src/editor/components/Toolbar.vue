<script lang="ts" setup>
import { downloadText, MAX_FILE_BYTES } from '@1337exp/taoux/file';
import { TaoButton, TaoSelect, TaoTooltip } from '@1337exp/taoui';
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
    if (!file) return;

    if (file.size > MAX_FILE_BYTES) editor.showNotice('error', 'file.error.tooLarge');
    else editor.importText(await file.text());
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
        <TaoButton size="small" variant="secondary" @click="editor.newGraph()">{{ t('file.new') }}</TaoButton>
        <TaoButton size="small" variant="secondary" @click="fileInput?.click()">{{ t('file.open') }}</TaoButton>
        <TaoButton size="small" variant="secondary" @click="downloadText(FILE_NAME, editor.exportText())">{{ t('file.save') }}</TaoButton>
        <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onFile" />

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
    align-items: center;
    gap: 6px;
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
