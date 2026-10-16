import { reactive, ref, type Ref } from 'vue';
import { disconnect, removeNode } from '@/graph/ops';
import type { Graph } from '@/graph/types';

/** Выделение на холсте (ноды и одна связь) и правки, которые к нему относятся: сдвиг и удаление. */
export function useSelection(graph: Ref<Graph>) {
    const selection = reactive(new Set<string>());
    const selectedConnection = ref<string | null>(null);

    function setSelection(ids: Iterable<string>) {
        const next = new Set(ids);
        for (const id of [...selection]) if (!next.has(id)) selection.delete(id);
        for (const id of next) selection.add(id);
    }

    function toggleSelected(id: string) {
        if (!selection.delete(id)) selection.add(id);
    }

    function selectConnection(id: string | null) {
        selectedConnection.value = id;
    }

    function moveSelected(dx: number, dy: number) {
        for (const id of selection) {
            const node = graph.value.nodes[id];
            if (node) {
                node.x += dx;
                node.y += dy;
            }
        }
    }

    /** Удаляет выделенную связь или выделенные ноды. */
    function removeSelected() {
        if (selectedConnection.value) {
            disconnect(graph.value, selectedConnection.value);
            selectedConnection.value = null;
            return;
        }
        for (const id of selection) removeNode(graph.value, id);
        selection.clear();
    }

    /** Новый документ: выделять нечего. */
    function reset() {
        selection.clear();
        selectedConnection.value = null;
    }

    /** После отмены или повтора: выделение не входит в историю, но не должно ссылаться на исчезнувшее. */
    function prune(doc: Graph) {
        for (const id of [...selection]) if (!doc.nodes[id]) selection.delete(id);
        if (selectedConnection.value && !doc.connections.some((c) => c.id === selectedConnection.value)) selectedConnection.value = null;
    }

    return { selection, selectedConnection, setSelection, toggleSelected, selectConnection, moveSelected, removeSelected, reset, prune };
}
