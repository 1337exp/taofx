<script lang="ts" setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from '@/i18n';
import { createPreview, type Preview, type Shape } from '@/preview/preview';
import { compile } from '@/tsl/compile';
import { createParticles, type ParticleEffect } from '@/tsl/particles';
import { advance, timelineLength } from '../timeline';
import { useEditor } from '../store';
import ParticleInspector from './ParticleInspector.vue';
import Timeline from './Timeline.vue';

const editor = useEditor();
const { t } = useI18n();

const canvas = ref<HTMLCanvasElement>();
const backend = ref('…');
const shape = ref<Shape>('sphere');
const inspectorOpen = ref(true);
let preview: Preview | null = null;
let fx: ParticleEffect | null = null;

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
    fx = createParticles(file, { registry: editor.registry });
    editor.setCompileErrors([...fx.errors]);
    preview.setParticles(fx.object);

    const effect = fx;
    let last = -1;
    preview.setFrameHook((seconds) => {
        const dt = last < 0 ? 0 : seconds - last;
        last = seconds;
        const system = editor.system;
        if (system && editor.playback.playing) editor.playback.time = advance(editor.playback.time, dt, timelineLength(system));
        effect.setTime(editor.playback.time);
    });
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
watch(shape, (s) => preview?.setShape(s));

onMounted(async () => {
    preview = await createPreview(canvas.value!);
    backend.value = preview.backend;
    preview.setShape(shape.value);
    rebuild();
});

onBeforeUnmount(() => {
    clearTimeout(timer);
    dropParticles();
    preview?.dispose();
});
</script>

<template>
    <section class="preview">
        <div class="stage">
            <canvas ref="canvas" />
            <div class="hud">
                <span class="muted">{{ backend }}</span>
                <template v-if="!editor.system">
                    <button :class="{ on: shape === 'sphere' }" @click="shape = 'sphere'">{{ t('preview.sphere') }}</button>
                    <button :class="{ on: shape === 'plane' }" @click="shape = 'plane'">{{ t('preview.plane') }}</button>
                    <button @click="editor.enableParticles()">{{ t('particles.enable') }}</button>
                </template>
                <button v-else :class="{ on: inspectorOpen }" @click="inspectorOpen = !inspectorOpen">{{ t('particles.expand') }}</button>
            </div>
            <ParticleInspector v-if="inspectorOpen" />
            <ul v-if="editor.compileErrors.length" class="status errors">
                <li class="head">{{ t('preview.errors', [editor.compileErrors.length]) }}</li>
                <li v-for="(e, i) in editor.compileErrors" :key="i">{{ e.nodeId ? `${e.nodeId}: ` : '' }}{{ e.message }}</li>
            </ul>
            <p v-else class="status ok">✔ {{ t('preview.ok') }}</p>
        </div>
        <Timeline />
    </section>
</template>

<style scoped>
.preview {
    display: flex;
    flex-direction: column;
    min-width: 0;
    height: 100%;
    border-left: 1px solid #222733;
    background: #0b0d12;
}

.stage {
    position: relative;
    flex: 1;
    min-height: 0;
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
    top: 12px;
    right: 12px;
    z-index: 6;
    display: flex;
    align-items: center;
    gap: 8px;
}

.muted {
    color: #7b8394;
    font-size: 12px;
}

button {
    padding: 4px 10px;
    border: 1px solid #2c3347;
    border-radius: 6px;
    background: #1b2030;
    color: #d6d9e0;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
}

button.on {
    border-color: #4a62b8;
    background: #2d3a63;
}

.status {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    margin: 0;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 12px;
    list-style: none;
}

.ok {
    right: auto;
    color: #7fd69a;
}

.errors {
    max-height: 40%;
    overflow: auto;
    background: rgba(42, 20, 22, 0.92);
    color: #ff8f8f;
}

.errors .head {
    margin-bottom: 2px;
    font-weight: 600;
}
</style>
