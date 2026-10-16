<script lang="ts" setup>
import { TaoButton, TaoSelect } from '@1337exp/taoui';
import { computed, ref } from 'vue';
import { MAX_TEXTURE_SRC, type NodeInstance } from '@/graph/types';
import { useI18n } from '@/i18n';
import { useEditor } from '../store';

const props = defineProps<{ node: NodeInstance; name: string }>();

const editor = useEditor();
const { t } = useI18n();

const fileInput = ref<HTMLInputElement | null>(null);
const selected = computed(() => props.node.params?.[props.name] ?? null);
const options = computed(() => Object.keys(editor.graph.textures ?? {}).map((key) => ({ value: key, label: key })));
const preview = computed(() => (selected.value ? editor.graph.textures?.[selected.value]?.src : undefined));

function onSelect(value: string | number | null) {
    if (typeof value === 'string') editor.setParam(props.node.id, props.name, value);
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
