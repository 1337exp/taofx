<script lang="ts" setup>
import { TaoCommandPalette, TaoConfirmHost, type TaoCommandItem } from '@1337exp/taoui';
import { computed, onMounted, onUnmounted } from 'vue';
import Shell from '@/editor/components/Shell.vue';
import { useEditorCommands } from '@/editor/shellCommands';
import { useEditor } from '@/editor/store';
import { ui } from '@/editor/ui';

const editor = useEditor();
const { commands, paletteItems } = useEditorCommands();

// читается внутри computed: подписи, «доступно» и сочетания следуют за состоянием и языком
const items = computed(() => paletteItems());

// Проект живёт только в памяти вкладки: при закрытии с несохранёнными правками браузер спросит (текст он покажет свой).
function onBeforeUnload(e: BeforeUnloadEvent) {
    if (!editor.dirty) return;
    e.preventDefault();
    e.returnValue = '';
}

let unbind: (() => void) | undefined;

onMounted(() => {
    editor.fitView(); // при каждом запуске открыт демо-граф: ничего не хранится между запусками
    window.addEventListener('beforeunload', onBeforeUnload);
    // сочетания всех команд (Ctrl+S, Ctrl+K…) слушает реестр; в полях ввода он пропускает то, что нужно тексту
    unbind = commands.bind(window);
});

onUnmounted(() => {
    window.removeEventListener('beforeunload', onBeforeUnload);
    unbind?.();
});

const onSelect = (item: TaoCommandItem) => commands.run(item.id);
</script>

<template>
    <Shell />
    <TaoCommandPalette v-model="ui.paletteOpen" :items="items" @select="onSelect" />
    <TaoConfirmHost />
</template>

<style>
html,
body,
#app {
    height: 100%;
    margin: 0;
}

body {
    background: var(--tao-color-bg, #0b0d12);
    color: var(--tao-color-text, #d6d9e0);
    font: 14px/1.4 system-ui, sans-serif;
}

* {
    box-sizing: border-box;
}
</style>
