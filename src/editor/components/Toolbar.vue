<script lang="ts" setup>
import { downloadText, MAX_FILE_BYTES } from '@1337exp/taoux/file';
import { nextTick, ref } from 'vue';
import { isLocaleCode, LOCALE_CODES, LOCALE_NAMES, setLocale, useI18n } from '@/i18n';
import { FILE_NAME } from '../file';
import { useEditor } from '../store';

const editor = useEditor();
const { t, locale } = useI18n();

const fileInput = ref<HTMLInputElement | null>(null);

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

function onLocaleChange(e: Event) {
    const value = (e.target as HTMLSelectElement).value;
    if (isLocaleCode(value)) setLocale(value);
}
</script>

<template>
    <div class="toolbar">
        <button class="text" @click="editor.newGraph()">{{ t('file.new') }}</button>
        <button class="text" @click="fileInput?.click()">{{ t('file.open') }}</button>
        <button class="text" @click="downloadText(FILE_NAME, editor.exportText())">{{ t('file.save') }}</button>
        <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="onFile" />

        <span class="sep" />

        <button class="icon" :disabled="!editor.canUndo" :title="t('history.undo')" @click="editor.undo()">↶</button>
        <button class="icon" :disabled="!editor.canRedo" :title="t('history.redo')" @click="editor.redo()">↷</button>

        <span class="sep" />

        <button class="text" @click="editor.fitView()">{{ t('view.fit') }}</button>
        <button class="text" @click="startParticles">{{ t('particles.start') }}</button>

        <select class="lang" :value="locale" :aria-label="t('ui.language')" @change="onLocaleChange">
            <option v-for="code in LOCALE_CODES" :key="code" :value="code">{{ LOCALE_NAMES[code] }}</option>
        </select>
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
    border: 1px solid #2a2d33;
    border-radius: 6px;
    background: rgba(24, 26, 30, 0.92);
    color: #d6d9de;
    font-size: 12px;
}

.sep {
    width: 1px;
    height: 18px;
    margin: 0 4px;
    background: #2a2d33;
}

.text,
.icon {
    padding: 2px 8px;
    border: 1px solid #333;
    border-radius: 4px;
    background: #2c3850;
    color: inherit;
    font: inherit;
    cursor: pointer;
}

.icon {
    width: 26px;
    padding: 2px 0;
}

.icon:disabled {
    opacity: 0.35;
    cursor: default;
}

.lang {
    margin-left: 6px;
    padding: 2px 4px;
    border: 1px solid #333;
    border-radius: 4px;
    background: #101214;
    color: inherit;
    font: inherit;
}

.notice {
    position: absolute;
    top: 58px;
    left: 12px;
    z-index: 10;
    max-width: 420px;
    padding: 5px 10px;
    border: 1px solid #2a2d33;
    border-radius: 6px;
    background: rgba(24, 26, 30, 0.95);
    color: #d6d9de;
    font-size: 12px;
}

.notice.error {
    border-color: #7a2e2e;
    color: #ff9b9b;
}
</style>
