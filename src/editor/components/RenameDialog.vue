<script lang="ts" setup>
import { TaoButton, TaoFormField, TaoInput, TaoModal } from '@1337exp/taoui';
import { computed, ref, watch } from 'vue';
import { useI18n } from '@/i18n';
import { renamableName } from '../projectFile';
import { useEditor } from '../store';
import { ui } from '../ui';

// Окно переименования ресурса проекта: имя без папки и без расширения; id и ссылки остаются, меняется только файл.
const editor = useEditor();
const { t } = useI18n();

const name = ref('');
const error = ref('');
const open = computed(() => ui.renameId !== null);

watch(
    () => ui.renameId,
    (id) => {
        error.value = '';
        const resource = id === null ? undefined : editor.project.find(id);
        name.value = resource ? renamableName(resource) : '';
    },
    { immediate: true },
);

function close() {
    ui.renameId = null;
}

function submit() {
    if (ui.renameId === null) return;
    const result = editor.renameResource(ui.renameId, name.value);
    if (result === 'invalid') error.value = t('project.renameInvalid');
    else if (result === 'taken') error.value = t('project.renameTaken');
    else close(); // 'ok', 'unchanged' и 'missing': закрываем (переименовывать больше нечего)
}
</script>

<template>
    <TaoModal :model-value="open" :title="t('project.renameTitle')" @update:model-value="(v) => !v && close()">
        <TaoFormField :label="t('project.renameName')" :error="error || undefined">
            <TaoInput v-model="name" :error="!!error" autofocus @update:model-value="error = ''" @keydown.enter.prevent="submit" />
        </TaoFormField>
        <template #footer>
            <TaoButton variant="secondary" @click="close">{{ t('project.renameCancel') }}</TaoButton>
            <TaoButton variant="primary" @click="submit">{{ t('project.renameOk') }}</TaoButton>
        </template>
    </TaoModal>
</template>
