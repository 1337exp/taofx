<script lang="ts" setup>
import { curvePath } from '@1337exp/taoux/curve';
import { TaoxLinks, type LinkLine, type LinkPreview } from '@1337exp/taoux/links';
import '@1337exp/taoux/links.css';
import { computed } from 'vue';
import { useEditor } from '../store';
import { TYPE_COLORS } from '../values';

const editor = useEditor();

/** Цвет связи это цвет типа, который по ней идёт. */
const colorOf = (ref: { node: string; pin: string }, dir: 'in' | 'out') => {
    const type = editor.pinType(ref, dir);
    return type ? TYPE_COLORS[type] : TYPE_COLORS.gen;
};

const lines = computed<LinkLine[]>(() => {
    const out: LinkLine[] = [];
    for (const c of editor.graph.connections) {
        const a = editor.pinWorld(c.from, 'out');
        const b = editor.pinWorld(c.to, 'in');
        if (!a || !b) continue;
        out.push({ id: c.id, d: curvePath(a[0], a[1], b[0], b[1]), color: colorOf(c.from, 'out') });
    }
    return out;
});

const preview = computed<LinkPreview | null>(() => {
    const p = editor.pending;
    if (!p) return null;

    const pos = editor.pinWorld(p.origin.ref, p.origin.dir);
    if (!pos) return null;

    const [cx, cy] = p.cursor;
    const d = p.origin.dir === 'out' ? curvePath(pos[0], pos[1], cx, cy) : curvePath(cx, cy, pos[0], pos[1]);
    return { id: 'preview', d, color: colorOf(p.origin.ref, p.origin.dir), invalid: p.valid === false };
});
</script>

<template>
    <TaoxLinks class="connections" glow :lines="lines" :selected-id="editor.selectedConnection" :preview="preview" />
</template>

<style scoped>
.connections {
    --tx-link-width: 2.5;
    --tx-link-width-active: 4;
    --tx-link-selected-color: #ffca00;
    --tx-link-invalid-color: #ff5252;
}
</style>
