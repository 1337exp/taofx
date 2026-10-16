import { ref, type Ref } from 'vue';
import { canConnect, connect, disconnect } from '@/graph/ops';
import type { Registry } from '@/graph/registry';
import type { Connection, Graph, PinRef } from '@/graph/types';
import type { PendingConnection, PinTarget } from './types';

/** Протягивание связи: пользователь тянет её от пина, пока не отпустит над другим пином или пустым местом. */
export function useConnectionDraft(graph: Ref<Graph>, registry: Registry) {
    const pending = ref<PendingConnection | null>(null);

    /** Связь, снятая с занятого входа в начале протягивания: если жест оборвут, её нужно вернуть. */
    let detached: { conn: Connection; index: number } | null = null;

    const pairOf = (origin: PinTarget, target: PinTarget): [PinRef, PinRef] => (origin.dir === 'out' ? [origin.ref, target.ref] : [target.ref, origin.ref]);

    function isValidTarget(origin: PinTarget, target: PinTarget): boolean {
        if (origin.dir === target.dir) return false;
        const [from, to] = pairOf(origin, target);
        return canConnect(graph.value, registry, from, to).ok;
    }

    /**
     * Начать связь с пина. Если это занятый вход, связь «снимается» с него,
     * и пользователь тянет её дальше от исходного выхода (как в Blueprint).
     */
    function startConnect(pin: PinTarget, cursor: [number, number]) {
        let origin = pin;
        detached = null;

        if (pin.dir === 'in') {
            const conn = graph.value.connections.find((c) => c.to.node === pin.ref.node && c.to.pin === pin.ref.pin);
            if (conn) {
                detached = { conn, index: graph.value.connections.indexOf(conn) };
                disconnect(graph.value, conn.id);
                origin = { ref: conn.from, dir: 'out' };
            }
        }

        pending.value = { origin, cursor, valid: null };
    }

    function updateConnect(cursor: [number, number], target: PinTarget | null) {
        const p = pending.value;
        if (!p) return;
        p.cursor = cursor;
        p.valid = target ? isValidTarget(p.origin, target) : null;
    }

    /** Жест оборван (потеря фокуса, система забрала указатель): связь не создаётся, а снятая с входа возвращается. */
    function cancelConnect() {
        if (detached && !graph.value.connections.some((c) => c.id === detached!.conn.id)) {
            graph.value.connections.splice(detached.index, 0, detached.conn);
        }
        detached = null;
        pending.value = null;
    }

    /** Завершить протягивание. Возвращает true, если связь создана. */
    function finishConnect(target: PinTarget | null): boolean {
        const p = pending.value;
        pending.value = null;
        detached = null;
        if (!p || !target || !isValidTarget(p.origin, target)) return false;

        const [from, to] = pairOf(p.origin, target);
        connect(graph.value, registry, from, to);
        return true;
    }

    /** Документ сменился: незавершённое протягивание не должно ссылаться на прежний. */
    function reset() {
        pending.value = null;
        detached = null;
    }

    return { pending, startConnect, updateConnect, cancelConnect, finishConnect, reset };
}
