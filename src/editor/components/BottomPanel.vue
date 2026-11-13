<script lang="ts" setup>
import { TaoTabs } from '@1337exp/taoui';
import { computed } from 'vue';
import { useI18n } from '@/i18n';
import { layout, type BottomTab } from '../layout';
import { usePreviewState } from '../state/preview';
import { useEditor } from '../store';
import BudgetPanel from './BudgetPanel.vue';

// Нижняя панель: «Проблемы» (всё, что не так с документом) и «Бюджет» (во что обходится эффект). Здесь же потом «Журнал».
const editor = useEditor();
const state = usePreviewState();
const { t } = useI18n();

const problems = computed(() => editor.compileErrors);
const tabs = computed(() => [
    { value: 'problems', label: problems.value.length ? `${t('shell.problems')} (${problems.value.length})` : t('shell.problems') },
    { value: 'budget', label: t('budget.title') },
]);

const tab = computed({
    get: () => layout.bottomTab,
    set: (value: string) => (layout.bottomTab = value as BottomTab),
});
</script>

<template>
    <section class="bottom">
        <TaoTabs v-model="tab" :items="tabs" />
        <div class="body">
            <template v-if="layout.bottomTab === 'problems'">
                <ul v-if="problems.length" class="problems">
                    <li v-for="(p, i) in problems" :key="i"><code v-if="p.nodeId">{{ p.nodeId }}</code>{{ p.message }}</li>
                </ul>
                <p v-else class="ok">✔ {{ t('shell.noProblems') }}</p>
            </template>
            <BudgetPanel v-else-if="editor.system" :report="state.budget" :live="state.live.count" :sim-ms="state.live.simMs" :max-particles="editor.system.maxParticles" :heat="state.overdraw" />
            <p v-else class="muted">{{ t('shell.materialHint') }}</p>
        </div>
    </section>
</template>

<style scoped>
.bottom {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background: var(--tao-color-surface, #0f121a);
    color: var(--tao-color-text, #d6d9e0);
}

.body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 8px 12px;
    font-size: 13px;
}

.problems {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
    color: var(--tao-color-danger, #ff8f8f);
}

.problems code {
    margin-right: 8px;
    color: var(--tao-color-text-muted, #8b929c);
}

.ok {
    margin: 0;
    color: var(--tao-color-success, #4cc38a);
}

.muted {
    margin: 0;
    color: var(--tao-color-text-muted, #8b929c);
}
</style>
