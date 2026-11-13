<script lang="ts" setup>
import { TaoConfirmHost } from '@1337exp/taoui';
import { onMounted, onUnmounted } from 'vue';
import Shell from '@/editor/components/Shell.vue';
import { useEditor } from '@/editor/store';

const editor = useEditor();

// Проект живёт только в памяти вкладки: при закрытии с несохранёнными правками браузер спросит (текст он покажет свой).
function onBeforeUnload(e: BeforeUnloadEvent) {
    if (!editor.dirty) return;
    e.preventDefault();
    e.returnValue = '';
}

// Ctrl+S (Cmd+S) сохраняет проект, а не страницу. Физическая клавиша: работает и на русской раскладке.
function onKeydown(e: KeyboardEvent) {
    if (e.code !== 'KeyS' || !(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
    e.preventDefault();
    void editor.saveProject();
}

onMounted(() => {
    editor.fitView(); // при каждом запуске открыт демо-граф: ничего не хранится между запусками
    window.addEventListener('beforeunload', onBeforeUnload);
    window.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
    window.removeEventListener('beforeunload', onBeforeUnload);
    window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
    <Shell />
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
