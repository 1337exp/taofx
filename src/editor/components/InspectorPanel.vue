<script lang="ts" setup>
import { TaoButton } from '@1337exp/taoui';
import { computed, watch } from 'vue';
import { useI18n } from '@/i18n';
import { inspectorTarget } from '../inspectorTarget';
import { layout } from '../layout';
import { useEditor } from '../store';
import { ui } from '../ui';
import AssetInspector from './AssetInspector.vue';
import NodeInspector from './NodeInspector.vue';
import ParticleInspector from './ParticleInspector.vue';

// «Инспектор»: свойства выбранного (docs/design.ru.md, идея 3). Что бы ни выбрали, справа показывается оно: нода графа,
// картинка из дерева проекта, а когда выбрано только сам документ, его параметры (у эффекта система частиц).
const editor = useEditor();
const { t } = useI18n();

const target = computed(() =>
    inspectorTarget({
        view: layout.view,
        selection: editor.selection,
        resource: (void editor.projectRevision, ui.selectedResource === null ? undefined : editor.project.find(ui.selectedResource)),
    }),
);

const heading = computed(() => (target.value.kind === 'node' ? t('inspector.node') : target.value.kind === 'asset' ? t('inspector.asset') : t('shell.inspector')));

// выбрана нода в графе: выбор в дереве возвращается на открытый документ, иначе картинка осталась бы «выбранной» под нодой
watch(
    () => editor.selection.size,
    (n) => {
        if (n > 0 && ui.selectedResource !== editor.openDocId) ui.selectedResource = editor.openDocId;
    },
);
</script>

<template>
    <aside class="panel" :aria-label="t('shell.inspector')">
        <header>{{ heading }}</header>
        <div class="body tao-density-compact">
            <NodeInspector v-if="target.kind === 'node'" :key="target.id" :node-id="target.id" />
            <AssetInspector v-else-if="target.kind === 'asset'" :key="target.resource.id" :resource="target.resource" />
            <ParticleInspector v-else-if="editor.system" />
            <div v-else class="empty">
                <strong>{{ t('shell.materialDoc') }}</strong>
                <p>{{ t('shell.materialHint') }}</p>
                <TaoButton variant="primary" @click="editor.enableParticles()">{{ t('particles.enable') }}</TaoButton>
            </div>
        </div>
    </aside>
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
    padding: 8px 12px 4px;
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.body {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 4px 12px 12px;
}

.empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    font-size: 13px;
}

.empty p {
    margin: 0;
    color: var(--tao-color-text-muted, #8b929c);
}
</style>
