<script lang="ts" setup>
import { TaoButton, TaoSelect } from '@1337exp/taoui';
import { computed, ref } from 'vue';
import { balancedGrid } from '@/flipbook/flipbook';
import { MAX_TEXTURE_SRC, type NodeInstance } from '@/graph/types';
import { useI18n } from '@/i18n';
import { useEditor } from '../store';

const props = defineProps<{ node: NodeInstance; name: string }>();

const editor = useEditor();
const { t } = useI18n();

const fileInput = ref<HTMLInputElement | null>(null);
const selected = computed(() => props.node.params?.[props.name] ?? null);

/** Значение варианта «картинка проекта, ещё не подключённая к графу»: отличается от имён текстур графа. */
const ASSET = '';

/** Текстуры графа, а за ними картинки проекта, которых в графе ещё нет (выбор подключит их без копии). */
const options = computed(() => {
    void editor.projectRevision;
    const own = Object.keys(editor.graph.textures ?? {});
    const linked = new Set(own.map((name) => editor.textureAssetOf(name)));
    const project = editor.project.resources
        .filter((r) => r.kind === 'image' && !linked.has(r.id))
        .map((r) => ({ value: ASSET + r.id, label: r.path.slice(r.path.lastIndexOf('/') + 1) }));
    return [...own.map((key) => ({ value: key, label: key })), ...project];
});
const preview = computed(() => (selected.value ? editor.graph.textures?.[selected.value]?.src : undefined));

/** Если выбранная картинка это запечённый лист флипбука: из скольких кадров и какой сеткой (её вводят в ноду «Спрайт-лист»). */
const sheetInfo = computed(() => {
    void editor.projectRevision;
    const asset = selected.value ? editor.textureAssetOf(selected.value) : undefined;
    if (!asset) return null;
    for (const r of editor.project.resources) {
        if (r.kind !== 'flipbook') continue;
        const body = editor.flipbookBody(r.id);
        if (body?.sheet !== asset || body.frames.length === 0) continue;
        const [cols, rows] = balancedGrid(body.frames.length);
        return { cols, rows, count: body.frames.length, fps: body.fps };
    }
    return null;
});

function onSelect(value: string | number | null) {
    if (typeof value !== 'string') return;
    if (!value.startsWith(ASSET)) return editor.setParam(props.node.id, props.name, value);
    const result = editor.useProjectImage(props.node.id, props.name, value.slice(ASSET.length));
    if (result !== 'ok') editor.showNotice('error', result === 'tooLarge' ? 'texture.tooLarge' : 'texture.missing');
}

function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

async function onFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // чтобы ту же картинку можно было выбрать повторно
    if (!file) return;

    if (!file.type.startsWith('image/')) return editor.showNotice('error', 'texture.notImage');
    const src = await readAsDataUrl(file);
    if (src.length > MAX_TEXTURE_SRC) return editor.showNotice('error', 'texture.tooLarge');
    editor.importTexture(props.node.id, props.name, file.name, src);
}
</script>

<template>
    <!-- поля внутри ноды не должны тянуть ноду и холст -->
    <div class="texture-param" @pointerdown.stop @wheel.stop>
        <div class="row">
            <TaoSelect size="small" class="select" :model-value="selected" :options="options" :placeholder="t('texture.none')" :clearable="false" @update:model-value="onSelect" />
            <TaoButton size="small" variant="secondary" @click="fileInput?.click()">{{ t('texture.upload') }}</TaoButton>
        </div>
        <img v-if="preview" class="preview" :src="preview" alt="" draggable="false" />
        <p v-if="sheetInfo" class="sheet">{{ t('texture.sheet', [sheetInfo.cols, sheetInfo.rows, sheetInfo.count, sheetInfo.fps]) }}</p>
        <input ref="fileInput" type="file" accept="image/*" hidden @change="onFile" />
    </div>
</template>

<style scoped>
.texture-param {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 6px 10px 2px;
}

.row {
    display: flex;
    align-items: center;
    gap: 6px;
}

.select {
    flex: 1;
    min-width: 110px;
}

.sheet {
    margin: 0;
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 11px;
}

.preview {
    width: 100%;
    max-height: 96px;
    object-fit: contain;
    border: 1px solid var(--tao-color-border);
    border-radius: 4px;
    /* шахматка под картинкой показывает прозрачность */
    background: repeating-conic-gradient(#3a3d44 0% 25%, #2a2d33 0% 50%) 50% / 12px 12px;
    image-rendering: pixelated;
}
</style>
