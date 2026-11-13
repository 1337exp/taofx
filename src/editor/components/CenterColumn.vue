<script lang="ts" setup>
import { TaoSplit, TaoTabs } from '@1337exp/taoui';
import { computed, defineAsyncComponent } from 'vue';
import { useI18n } from '@/i18n';
import { layout, type CenterView } from '../layout';
import BottomPanel from './BottomPanel.vue';
import GraphView from './GraphView.vue';
import Timeline from './Timeline.vue';

// Превью тянет за собой three (WebGPU) и компилятор TSL, это больше половины сборки: грузим после того, как оболочка показана
const PreviewPanel = defineAsyncComponent(() => import('./PreviewPanel.vue'));

const { t } = useI18n();

const views = computed(() => [
    { value: 'preview', label: t('shell.preview') },
    { value: 'graph', label: t('shell.graph') },
]);
const view = computed({
    get: () => layout.view,
    set: (value: string) => (layout.view = value as CenterView),
});
</script>

<template>
    <div class="center">
        <TaoTabs v-model="view" :items="views" :aria-label="t('shell.views')" />
        <TaoSplit v-model="layout.stage" direction="column" class="grow" :min="25" :min-end="10" @change="(v: number) => (layout.stage = v)">
            <template #start>
                <div class="stage">
                    <!-- Превью остаётся в памяти под графом: заново поднимать WebGPU при каждом переключении дорого -->
                    <div v-show="layout.view === 'preview'" class="view"><PreviewPanel /></div>
                    <div v-if="layout.view === 'graph'" class="view"><GraphView /></div>
                    <Timeline />
                </div>
            </template>
            <template #end>
                <BottomPanel />
            </template>
        </TaoSplit>
    </div>
</template>

<style scoped>
.center {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    background: var(--tao-color-surface, #0f121a);
}

.grow {
    flex: 1;
    min-height: 0;
}

.stage {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
}

.view {
    flex: 1;
    min-height: 0;
}
</style>
