<script lang="ts" setup>
import { TaoButton } from '@1337exp/taoui';
import { useI18n } from '@/i18n';
import { useEditor } from '../store';
import ParticleInspector from './ParticleInspector.vue';

// «Инспектор»: свойства выбранного. Пока выбор один, документ: у эффекта это его система, у материала подсказка.
// Инспектор по выделению (слой, нода, ассет) строится на этом месте следующими шагами этапа 4.
const editor = useEditor();
const { t } = useI18n();
</script>

<template>
    <aside class="panel" :aria-label="t('shell.inspector')">
        <header>{{ t('shell.inspector') }}</header>
        <div class="body tao-density-compact">
            <ParticleInspector v-if="editor.system" />
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
