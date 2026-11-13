<script lang="ts" setup>
import { TaoButton, TaoSegmented, TaoSegmentedOption } from '@1337exp/taoui';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from '@/i18n';
import { measureSystem } from '@/particles/budget';
import { createPreview, type Preview } from '@/preview/preview';
import { compile } from '@/tsl/compile';
import { createParticles, type ParticleEffect } from '@/tsl/particles';
import { useEditor } from '../store';
import { usePreviewState } from '../state/preview';

// Превью: рендерер, частицы и его собственная панель кнопок. Бюджет, число частиц и рендерер отдаются в `usePreviewState`:
// нижняя панель и статус-строка читают оттуда. Таймлайн, инспектор и проблемы это отдельные области оболочки.
const editor = useEditor();
const state = usePreviewState();
const { t } = useI18n();

const canvas = ref<HTMLCanvasElement>();
let preview: Preview | null = null;
let fx: ParticleEffect | null = null;

/** Бюджет по всей длине системы для текущего вида камеры (считается без рендерера, на CPU). */
function updateBudget() {
    if (!preview || !editor.system) {
        state.budget = null;
        return;
    }
    // у больших систем меньше измерений: правка параметров не должна подвешивать редактор
    const system = JSON.parse(JSON.stringify(editor.system)) as typeof editor.system;
    state.budget = measureSystem(system, preview.getFillView(), { samples: system.maxParticles > 5000 ? 40 : 120 });
}

function dropParticles() {
    if (!fx) return;
    preview?.setParticles(null);
    preview?.setFrameHook(null);
    fx.dispose();
    fx = null;
}

/** Обычный материал: граф собирается в TSL и показывается на сфере. */
function buildSurface() {
    dropParticles();
    const result = compile(editor.graph, editor.registry);
    editor.setCompileErrors(result.errors);
    if (result.surface) preview?.setSurface(result.surface);
}

/** Система частиц: параметры и граф копируются (реактивные объекты в рантайм не отдаём), время ведёт полоска таймлайна. */
function buildParticles() {
    dropParticles();
    if (!preview || !editor.system) return;
    const file = JSON.parse(JSON.stringify({ system: editor.system, material: editor.graph }));
    try {
        fx = createParticles(file, { registry: editor.registry });
    } catch (e) {
        // параметры, которые рантайм не примет (например, слишком много точек шлейфа): показываем причину, редактор не падает
        editor.setCompileErrors([{ kind: 'build', message: e instanceof Error ? e.message : String(e) }]);
        state.budget = null;
        return;
    }
    editor.setCompileErrors([...fx.errors]);
    preview.setParticles(fx.object);
    fx.setDebug(state.overdraw ? 'overdraw' : null);
    updateBudget();

    // время ведёт модель воспроизведения из стора (taoux/playback): кадру остаётся показать частицы на этот момент
    const effect = fx;
    preview.setFrameHook(() => effect.setTime(editor.playback.time));
}

function rebuild() {
    if (editor.system) buildParticles();
    else buildSurface();
}

// Пересборка по структуре графа и параметрам системы: сдвиг нод и ход времени её не вызывают. Пауза склеивает серии правок.
let timer: ReturnType<typeof setTimeout> | undefined;
watch(
    () => [editor.structureKey, editor.systemKey],
    () => {
        clearTimeout(timer);
        timer = setTimeout(rebuild, 120);
    },
);
watch(() => state.shape, (s) => preview?.setShape(s));
watch(() => state.environment, (on) => preview?.setEnvironment(on));
watch(() => state.overdraw, (on) => {
    fx?.setDebug(on ? 'overdraw' : null);
    preview?.setOverdraw(on);
});

// Живые числа (частицы сейчас, мс симуляции) обновляем несколько раз в секунду: на каждый кадр Vue это ни к чему
const poll = setInterval(() => {
    if (fx) state.live = { count: fx.stats.live, simMs: fx.stats.simMs };
}, 250);

onMounted(async () => {
    preview = await createPreview(canvas.value!);
    state.backend = preview.backend;
    preview.setShape(state.shape);
    rebuild();
});

onBeforeUnmount(() => {
    clearTimeout(timer);
    clearInterval(poll);
    dropParticles();
    state.live = { count: 0, simMs: 0 };
    state.budget = null;
    preview?.dispose();
});
</script>

<template>
    <section class="preview">
        <canvas ref="canvas" />
        <div class="hud">
            <template v-if="!editor.system">
                <TaoSegmented v-model="state.shape">
                    <TaoSegmentedOption value="sphere" :label="t('preview.sphere')" />
                    <TaoSegmentedOption value="plane" :label="t('preview.plane')" />
                </TaoSegmented>
            </template>
            <template v-else>
                <TaoButton v-model:pressed="state.overdraw" variant="ghost" tone="neutral">{{ t('budget.overdraw') }}</TaoButton>
                <TaoButton v-model:pressed="state.environment" variant="ghost" tone="neutral">{{ t('preview.environment') }}</TaoButton>
            </template>
        </div>
    </section>
</template>

<style scoped>
.preview {
    position: relative;
    min-width: 0;
    height: 100%;
    background: var(--tao-color-bg, #0b0d12);
}

/* Холст вынут из потока: его собственный размер в пикселях не должен влиять на высоту панели (иначе она растёт при каждом ResizeObserver) */
canvas {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
}

.hud {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    border-radius: var(--tao-radius-control, 8px);
    background: var(--tao-color-surface, rgba(15, 18, 26, 0.85));
}
</style>
