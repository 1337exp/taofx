import { screenToWorld, type Camera } from '@1337exp/taoux/camera';
import { ref, type Ref } from 'vue';
import { addNode, canConnect, connect, findCompatiblePin } from '@/graph/ops';
import type { Registry } from '@/graph/registry';
import type { Graph, PinType } from '@/graph/types';
import type { PaletteState, PinDir, PinTarget } from './types';

export interface PaletteDeps {
    graph: Ref<Graph>;
    registry: Registry;
    camera: Ref<Camera>;
    /** Размер видимой области холста, px: новые ноды ставятся в её центр. */
    viewport: Ref<{ w: number; h: number }>;
    /** Выведенный тип пина или undefined, если граф про него ещё не знает. */
    pinType(ref: PinTarget['ref'], dir: PinDir): PinType | undefined;
    /** Выделение: новая нода становится выделенной. */
    select(ids: Iterable<string>): void;
    selectConnection(id: string | null): void;
}

/** Палитра нод: окно поиска, которое открывают пустым местом или оборванной связью, и создание ноды из неё. */
export function usePalette({ graph, registry, camera, viewport, pinType, select, selectConnection }: PaletteDeps) {
    const palette = ref<PaletteState | null>(null);

    /** Тип пина-источника для подбора совместимого пина новой ноды: у `gen`-входа его нет, подходит любой. */
    function originType(origin: PinTarget): PinType {
        const resolvedType = pinType(origin.ref, origin.dir);
        if (resolvedType) return origin.dir === 'out' ? resolvedType : (registry.get(graph.value.nodes[origin.ref.node]?.type ?? '')?.inputs[origin.ref.pin]?.type ?? 'gen');
        return 'gen';
    }

    function openPalette(screen: [number, number], world: [number, number], origin: PinTarget | null = null) {
        palette.value = { screen, world, origin };
    }

    function closePalette() {
        palette.value = null;
    }

    /** Нода типа `type` подходит под origin палитры (если он есть). */
    function fitsPaletteOrigin(type: string): boolean {
        const origin = palette.value?.origin;
        const def = registry.get(type);
        return !origin || (!!def && findCompatiblePin({ type: originType(origin), dir: origin.dir }, def) !== null);
    }

    /** Создаёт ноду в позиции палитры; если палитру открыли связью, подключает новую ноду к её пину. */
    function createFromPalette(type: string) {
        const p = palette.value;
        const def = registry.get(type);
        if (!p || !def) return;

        // Нода, у которой тянули вход, должна оказаться левее курсора.
        const x = p.origin?.dir === 'in' ? p.world[0] - 200 : p.world[0];
        const node = addNode(graph.value, registry, type, { x: Math.round(x), y: Math.round(p.world[1]) });

        if (p.origin) {
            const pin = findCompatiblePin({ type: originType(p.origin), dir: p.origin.dir }, def);
            if (pin) {
                const target = { node: node.id, pin };
                const [from, to] = p.origin.dir === 'out' ? [p.origin.ref, target] : [target, p.origin.ref];
                if (canConnect(graph.value, registry, from, to).ok) connect(graph.value, registry, from, to);
            }
        }

        select([node.id]);
        selectConnection(null);
        palette.value = null;
    }

    /** Ставит ноду в центр видимой области и выделяет её. */
    function addNodeAtCenter(type: string) {
        const [x, y] = screenToWorld(camera.value, viewport.value.w / 2, viewport.value.h / 2);
        const node = addNode(graph.value, registry, type, { x: Math.round(x), y: Math.round(y) });
        select([node.id]);
        selectConnection(null);
        return node;
    }

    return { palette, openPalette, closePalette, fitsPaletteOrigin, createFromPalette, addNodeAtCenter };
}
