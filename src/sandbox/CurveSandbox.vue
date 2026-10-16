<script lang="ts" setup>
import { TaoSelect } from '@1337exp/taoui';
import { computed, ref } from 'vue';
import CurveEditor from '@/editor/components/CurveEditor.vue';
import { isLocaleCode, LOCALE_CODES, LOCALE_NAMES, setLocale, useI18n } from '@/i18n';
import type { Curve } from '@/particles/types';

const { locale } = useI18n();
const languages = computed(() => LOCALE_CODES.map((code) => ({ value: code, label: LOCALE_NAMES[code] })));

interface Case {
    title: string;
    note: string;
    min?: number;
    max?: number;
    initial: Curve;
    value: Curve;
}

const make = (title: string, note: string, initial: Curve, min?: number, max?: number): Case => ({ title, note, min, max, initial, value: JSON.parse(JSON.stringify(initial)) as Curve });

// Разные границы значений: именно на них держится сетка и зажим
const cases = ref<Case[]>([
    make('Размер, 0…∞', 'min 0, верх по данным', [{ t: 0, v: 0 }, { t: 0.2, v: 1 }, { t: 1, v: 0 }], 0),
    make('Непрозрачность, 0…1', 'min 0, max 1', [{ t: 0, v: 1 }, { t: 1, v: 0 }], 0, 1),
    make('Скорость, −1…1', 'min −1, max 1', [{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: -1 }], -1, 1),
    make('Без границ', 'всё авто', 2),
]);

const onLocale = (value: string | number | null) => {
    if (isLocaleCode(value)) setLocale(value);
};
</script>

<template>
    <main class="page">
        <header>
            <h1>CurveEditor</h1>
            <TaoSelect class="lang" size="small" :model-value="locale" :options="languages" :clearable="false" @update:model-value="onLocale" />
        </header>

        <div class="grid">
            <section v-for="c in cases" :key="c.title" class="case">
                <h2>{{ c.title }} <small>{{ c.note }}</small></h2>
                <CurveEditor v-model="c.value as never" :min="c.min" :max="c.max" :default-value="c.initial" />
                <pre>{{ JSON.stringify(c.value) }}</pre>
            </section>
        </div>
    </main>
</template>

<style>
html,
body,
#app {
    margin: 0;
    min-height: 100%;
}

body {
    background: var(--tao-color-bg);
    color: var(--tao-color-text);
    font: 14px/1.4 system-ui, sans-serif;
}

* {
    box-sizing: border-box;
}
</style>

<style scoped>
.page {
    max-width: 1000px;
    margin: 0 auto;
    padding: 24px 16px;
}

header {
    display: flex;
    align-items: center;
    justify-content: space-between;
}

h1 {
    margin: 0;
    font-size: 20px;
}

.lang {
    width: 120px;
}

.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 16px;
    margin-top: 16px;
}

.case {
    padding: 12px;
    border: 1px solid var(--tao-color-border);
    border-radius: 8px;
    background: var(--tao-color-surface);
}

h2 {
    margin: 0 0 8px;
    font-size: 13px;
}

h2 small {
    margin-left: 6px;
    color: var(--tao-color-text-muted);
    font-weight: 400;
}

pre {
    margin: 8px 0 0;
    color: var(--tao-color-text-muted);
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-all;
}
</style>
