<script lang="ts" setup>
import { TaoButton } from '@1337exp/taoui';
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from '@/i18n';
import { COMMAND } from '../commands';
import { MIME_BY_EXT } from '../projectFile';
import { useEditorCommands } from '../shellCommands';
import { extname } from '@/project/paths';
import { useEditor } from '../store';
import type { Resource } from '@/project/project';

// Инспектор выбранной картинки проекта: как она выглядит, что это за файл, кто ею пользуется, переименовать и удалить.
const props = defineProps<{ resource: Resource }>();

const editor = useEditor();
const { t } = useI18n();
const { commands } = useEditorCommands();

const url = ref('');
const size = ref<{ w: number; h: number } | null>(null);

/** Картинка в памяти проекта показывается через временный адрес: по нему не нужны ни сервер, ни `data:`. */
function load() {
    if (url.value) URL.revokeObjectURL(url.value);
    url.value = '';
    size.value = null;
    const bytes = editor.project.files.read(props.resource.path);
    const mime = MIME_BY_EXT[extname(props.resource.path).toLowerCase()];
    if (!bytes || !mime) return;
    url.value = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
}
watch(() => [props.resource.id, props.resource.path, editor.projectRevision], load, { immediate: true });
onBeforeUnmount(() => url.value && URL.revokeObjectURL(url.value));

const bytes = computed(() => editor.project.files.read(props.resource.path)?.length ?? 0);
const kb = computed(() => (bytes.value < 1024 ? `${bytes.value} B` : `${(bytes.value / 1024).toFixed(bytes.value < 10240 ? 1 : 0)} KB`));
const usedBy = computed(() => {
    void editor.projectRevision;
    return editor.project.referrers(props.resource.id);
});
const name = (r: Resource) => r.path.slice(r.path.lastIndexOf('/') + 1);
</script>

<template>
    <div class="asset-inspector">
        <h3>{{ name(resource) }}</h3>
        <p class="meta"><code>{{ resource.path }}</code></p>
        <div class="picture"><img v-if="url" :src="url" :alt="name(resource)" @load="(e) => (size = { w: (e.target as HTMLImageElement).naturalWidth, h: (e.target as HTMLImageElement).naturalHeight })" /></div>
        <dl>
            <dt>{{ t('inspector.dimensions') }}</dt>
            <dd>{{ size ? `${size.w} × ${size.h}` : '…' }}</dd>
            <dt>{{ t('inspector.fileSize') }}</dt>
            <dd>{{ kb }}</dd>
            <dt>id</dt>
            <dd><code>{{ resource.id }}</code></dd>
            <dt>{{ t('inspector.usedBy') }}</dt>
            <dd>
                <template v-if="usedBy.length">{{ usedBy.map(name).join(', ') }}</template>
                <span v-else class="muted">{{ t('inspector.notUsed') }}</span>
            </dd>
        </dl>
        <div class="actions">
            <TaoButton variant="secondary" @click="commands.run(COMMAND.resourceRename)">{{ t('project.rename') }}</TaoButton>
            <TaoButton variant="secondary" tone="danger" @click="commands.run(COMMAND.resourceDelete)">{{ t('project.delete') }}</TaoButton>
        </div>
    </div>
</template>

<style scoped>
.asset-inspector {
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
}

h3 {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--tao-color-text-strong, #fff);
    font-size: 15px;
}

.meta {
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--tao-color-text-muted, #8b929c);
    font-size: 12px;
}

.picture {
    display: grid;
    place-items: center;
    min-height: 96px;
    padding: 8px;
    border: 1px solid var(--tao-color-border, #2a2d33);
    border-radius: var(--tao-radius-control, 8px);
    /* шахматка: прозрачные места картинки видны */
    background: repeating-conic-gradient(var(--tao-color-surface-raised, #1c1f26) 0% 25%, var(--tao-color-bg, #0b0d12) 0% 50%) 0 0 / 16px 16px;
}

.picture img {
    max-width: 100%;
    max-height: 220px;
    image-rendering: pixelated;
}

dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 4px 12px;
    margin: 0;
}

dt {
    color: var(--tao-color-text-muted, #8b929c);
}

dd {
    margin: 0;
    overflow-wrap: anywhere;
}

.muted {
    color: var(--tao-color-text-muted, #8b929c);
}

.actions {
    display: flex;
    gap: 8px;
    margin-top: 6px;
}
</style>
