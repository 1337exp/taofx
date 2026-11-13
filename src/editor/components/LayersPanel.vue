<script lang="ts" setup>
import { TaoList, TaoListItem } from '@1337exp/taoui';
import { useI18n } from '@/i18n';
import { useEditor } from '../store';

// «Слои»: пока у эффекта один слой (сама система). Список слоёв с глазом, порядком и добавлением из пресета придёт с форматом
// эффекта из слоёв (этап 6); область и её место в оболочке уже здесь.
const editor = useEditor();
const { t } = useI18n();
</script>

<template>
    <section class="panel">
        <header>{{ t('shell.layers') }}</header>
        <div class="body">
            <TaoList v-if="editor.system" :aria-label="t('shell.layers')" :bordered="false">
                <TaoListItem clickable selected>{{ t('shell.layer', [1]) }}</TaoListItem>
            </TaoList>
            <p v-else class="hint">{{ t('shell.noLayers') }}</p>
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
    padding: 4px 8px 8px;
}

.hint {
    margin: 4px;
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 12px;
}
</style>
