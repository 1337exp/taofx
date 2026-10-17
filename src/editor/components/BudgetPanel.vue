<script lang="ts" setup>
import { computed } from 'vue';
import { useI18n } from '@/i18n';
import type { BudgetReport } from '@/particles/budget';
import { HEAT_STOPS } from '@/preview/overdraw';

const props = defineProps<{
    report: BudgetReport | null;
    /** Живых частиц и мс симуляции прямо сейчас. */
    live: number;
    simMs: number;
    maxParticles: number;
    /** Включена тепловая карта: показываем легенду. */
    heat: boolean;
}>();

const { t } = useI18n();

/** Слои перекрытия: до 2 легко, до 5 заметно, дальше дорого (особенно на мобильных). */
const level = computed(() => (props.report ? (props.report.peakFill < 2 ? 'good' : props.report.peakFill < 5 ? 'warn' : 'bad') : 'good'));
const fmt = (n: number, digits = 1) => n.toFixed(digits);
const legend = `linear-gradient(90deg, ${HEAT_STOPS.map((s, i) => `${s.color} ${Math.round((i / (HEAT_STOPS.length - 1)) * 100)}%`).join(', ')})`;
</script>

<template>
    <div class="budget" @pointerdown.stop @wheel.stop>
        <div class="title">{{ t('budget.title') }}</div>
        <template v-if="report">
            <div class="row"><span>{{ t('budget.particles') }}</span><b>{{ live }}</b><span class="muted">{{ t('budget.peak') }} {{ report.peakLive }} / {{ maxParticles }}</span></div>
            <div class="row"><span>{{ t('budget.fill') }}</span><b :class="level">{{ fmt(report.peakFill) }}</b><span class="muted">{{ t('budget.avg') }} {{ fmt(report.avgFill) }}</span></div>
            <div class="row"><span>{{ t('budget.simulation') }}</span><b>{{ fmt(simMs, 2) }} {{ t('budget.ms') }}</b><span class="muted">{{ t('budget.peak') }} {{ fmt(report.simMsPeak, 2) }}</span></div>
            <div class="row"><span>{{ t('budget.vertices') }}</span><b>{{ report.peakVertices }}</b></div>
            <div v-if="report.capped" class="warn">{{ t('budget.capped') }}</div>
            <div v-if="level === 'bad'" class="warn">{{ t('budget.heavy') }}</div>
        </template>
        <div v-if="heat" class="legend">
            <div class="bar" :style="{ background: legend }" />
            <div class="ticks"><span v-for="s in HEAT_STOPS" :key="s.layers">{{ s.layers }}</span></div>
            <div class="muted">{{ t('budget.layers') }}</div>
        </div>
    </div>
</template>

<style scoped>
.budget {
    position: absolute;
    top: 44px;
    left: 12px;
    z-index: 5;
    min-width: 230px;
    padding: 8px 10px;
    border: 1px solid var(--tao-color-border, #222733);
    border-radius: 8px;
    background: var(--tao-color-surface, rgba(15, 18, 26, 0.9));
    color: var(--tao-color-text, #d6d9e0);
    font-size: 12px;
}

.title {
    margin-bottom: 4px;
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
}

.row {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 8px;
    align-items: baseline;
    margin: 2px 0;
}

.muted {
    color: var(--tao-color-text-muted, #8b929c);
}

.good {
    color: var(--tao-color-success, #55d68a);
}

.warn,
.bad {
    color: #ffb454;
}

.bad {
    color: #ff6b6b;
}

div.warn {
    margin-top: 4px;
    font-size: 11px;
}

.legend {
    margin-top: 8px;
}

.bar {
    height: 8px;
    border-radius: 4px;
}

.ticks {
    display: flex;
    justify-content: space-between;
    margin-top: 2px;
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 10px;
}
</style>
