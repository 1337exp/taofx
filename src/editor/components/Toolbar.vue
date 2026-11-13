<script lang="ts" setup>
import { TaoButton, TaoMenubar, TaoTooltip } from '@1337exp/taoui';
import { computed } from 'vue';
import { useI18n } from '@/i18n';
import { COMMAND } from '../commands';
import { useEditorCommands } from '../shellCommands';
import { useEditor } from '../store';

// Верхняя строка оболочки: меню (строится из реестра команд), отмена и возврат, название проекта, палитра команд и главное
// действие области («Экспорт»). Ни одного действия здесь не написано: всё это команды из `commands.ts`.
const editor = useEditor();
const { t } = useI18n();
const { commands, menu } = useEditorCommands();

// читается внутри computed: подписи, «доступно» и «отмечено» следуют за состоянием и языком
const items = computed(() => menu());

const run = (id: string | number) => commands.run(String(id));
const hint = (id: string) => [commands.label(id), commands.shortcutLabel(id)].filter(Boolean).join('  ');
</script>

<template>
    <header class="top">
        <TaoMenubar :items="items" :bordered="false" :aria-label="t('commands.file')" @select="run" />

        <span class="sep" />

        <TaoTooltip :content="hint(COMMAND.undo)"><TaoButton variant="ghost" tone="neutral" :aria-label="t('history.undo')" :disabled="!commands.isEnabled(COMMAND.undo)" @click="run(COMMAND.undo)">↶</TaoButton></TaoTooltip>
        <TaoTooltip :content="hint(COMMAND.redo)"><TaoButton variant="ghost" tone="neutral" :aria-label="t('history.redo')" :disabled="!commands.isEnabled(COMMAND.redo)" @click="run(COMMAND.redo)">↷</TaoButton></TaoTooltip>

        <span class="doc" :title="editor.dirty ? t('file.unsaved') : undefined">
            {{ editor.projectName || t('file.untitled') }}<i v-if="editor.dirty" class="dirty" aria-hidden="true">●</i>
            <span v-if="editor.dirty" class="sr-only">{{ t('file.unsaved') }}</span>
        </span>

        <span class="grow" />

        <TaoButton variant="ghost" tone="neutral" @click="run(COMMAND.palette)">{{ t('commands.paletteButton') }} <kbd class="key">{{ commands.shortcutLabel(COMMAND.palette) }}</kbd></TaoButton>
        <TaoTooltip :content="hint(COMMAND.export)"><TaoButton variant="primary" @click="run(COMMAND.export)">{{ t('shell.export') }}</TaoButton></TaoTooltip>
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

.key {
    margin-left: 6px;
    color: var(--tao-color-text-muted, #8b929c);
    font: inherit;
    font-size: 12px;
}

.sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
}
</style>
