<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from '@/i18n';
import { layout } from '../layout';
import { usePreviewState } from '../state/preview';
import { useEditor } from '../store';

const editor = useEditor();
const state = usePreviewState();
const { t } = useI18n();

const problems = computed(() => editor.compileErrors.length);

/** Счётчик проблем ведёт к нижней панели: статус-строка сама ничего не правит. */
function showProblems() {
    layout.bottomTab = 'problems';
}
</script>

<template>
    <footer class="status" role="status">
        <span>{{ state.backend }}</span>
        <span v-if="editor.system">{{ t('shell.statusParticles', [state.live.count]) }}</span>
        <button type="button" class="problems" :class="{ bad: problems > 0 }" @click="showProblems">{{ t('shell.statusProblems', [problems]) }}</button>
        <span class="grow" />
        <span :class="{ unsaved: editor.dirty }">{{ editor.dirty ? t('shell.statusUnsaved') : t('shell.statusSaved') }}</span>
    </footer>
</template>

<style scoped>
.status {
    display: flex;
    align-items: center;
    gap: 16px;
    height: 24px;
    padding: 0 12px;
    border-top: 1px solid var(--tao-color-border, #222733);
    background: var(--tao-color-surface, #0f121a);
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 12px;
}

.grow {
    flex: 1;
}

.problems {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
}

.problems:hover {
    color: var(--tao-color-text, #bfbfbf);
}

.problems.bad {
    color: var(--tao-color-danger, #ff8f8f);
}

.unsaved {
    color: var(--tao-color-accent, #f0b04a);
}
</style>
