import { createCamera, MAX_ZOOM, MIN_ZOOM, screenToWorld, type Camera } from '@1337exp/taoux/camera';
import { createPinRegistry } from '@1337exp/taoux/pins';
import { createPlayback } from '@1337exp/taoux/playback';
import { createDocumentSession, type SessionNotice } from '@1337exp/taoux/session';
import { defineStore } from 'pinia';
import { computed, markRaw, reactive, ref, watch } from 'vue';
import { DEMO_GRAPH } from '@/demo';
import { DEMO_PARTICLES } from '@/demoParticles';
import { defaultSystem } from '@/particles/serialize';
import type { SystemDef } from '@/particles/types';
import { emptyDoc, parseDoc, serializeDoc, type EditorDoc } from './doc';
import { addNode, canConnect, connect, disconnect, findCompatiblePin, removeNode } from '@/graph/ops';
import { resolveTypes, type GraphError } from '@/graph/resolve';
import type { Connection, Graph, PinRef, PinType } from '@/graph/types';
import type { MessageKey } from '@/i18n';
import { createDefaultRegistry } from '@/nodes';
import { storage } from './persistence';
import { timelineLength } from './timeline';

export type PinDir = 'in' | 'out';

/** Короткое сообщение пользователю (результат открытия файла и т.п.). Хранит ключ перевода. */
export type Notice = SessionNotice<MessageKey>;

/** Пин и его направление: адрес пина для общего холста. */
export interface PinTarget {
    ref: PinRef;
    dir: PinDir;
}

/** Связь, которую пользователь сейчас протягивает. */
export interface PendingConnection {
    /** Пин, с которого начали. */
    origin: PinTarget;
    /** Курсор в мировых координатах. */
    cursor: [number, number];
    /** Пин под курсором допустим (true), недопустим (false) или под курсором нет пина (null). */
    valid: boolean | null;
}

/** Открытая палитра нод. */
export interface PaletteState {
    /** Позиция окна относительно холста, px. */
    screen: [number, number];
    /** Куда поставить новую ноду, мировые координаты. */
    world: [number, number];
    /** Если палитру открыли протягиванием связи, пин, от которого тянули. */
    origin: PinTarget | null;
}

/** Оценка размера ноды для «показать всё»: точный размер известен только вёрстке. */
const NODE_ESTIMATE = { w: 210, h: 120 };
const FIT_PADDING = 48;

const cloneDemo = (): Graph => JSON.parse(JSON.stringify(DEMO_GRAPH));

export const useEditor = defineStore('editor', () => {
    const registry = markRaw(createDefaultRegistry());
    const graph = ref<Graph>(cloneDemo());
    /** Параметры системы частиц; null: документ это обычный материал. */
    const system = ref<SystemDef | null>(null);
    /**
     * Воспроизведение предпросмотра частиц (в историю и файл не входит): время ведёт модель из taoux, здесь её отражение для интерфейса.
     * Цикл всегда включён (полоска показывает несколько циклов системы), играет только пока документ это система частиц.
     */
    const clip = createPlayback({ length: 2, loop: true });
    const playback = reactive({ playing: false, time: 0 });
    clip.subscribe((s) => {
        playback.playing = s.playing;
        playback.time = s.time;
    });
    const camera = ref<Camera>(createCamera());
    const selection = reactive(new Set<string>());
    const selectedConnection = ref<string | null>(null);
    const pending = ref<PendingConnection | null>(null);
    const palette = ref<PaletteState | null>(null);

    /** Размер видимой области холста (px): нужен, чтобы ставить ноды в центр экрана и «показывать всё». Обновляет холст. */
    const viewport = ref({ w: 800, h: 600 });

    /** Позиции пинов относительно левого верхнего угла ноды (в мировых единицах), измеряются по DOM. */
    const pins = createPinRegistry();

    /** Выведенные типы всех пинов (`gen` уже превратился в конкретный тип) и ошибки графа. */
    const resolved = computed(() => resolveTypes(graph.value, registry));

    /** Ошибки последней сборки в материал: по ним вид подсвечивает ноды. Заполняет панель предпросмотра. */
    const compileErrors = ref<GraphError[]>([]);
    const setCompileErrors = (errors: GraphError[]) => {
        compileErrors.value = errors;
    };

    /**
     * Ключ структуры графа без положений нод: меняется, когда граф нужно собрать заново.
     * Перетаскивание ноды его не трогает, поэтому материал не пересобирается на каждый сдвиг.
     */
    const structureKey = computed(() =>
        JSON.stringify([
            Object.values(graph.value.nodes).map((n) => [n.id, n.type, n.values, n.params]),
            // картинки целиком не кладём в ключ: имя, длина и концы адреса достаточно, чтобы заметить замену
            Object.entries(graph.value.textures ?? {}).map(([name, t]) => [name, t.src.length, t.src.slice(0, 40), t.src.slice(-40)]),
            graph.value.connections.map((c) => [c.from.node, c.from.pin, c.to.node, c.to.pin]),
        ]),
    );

    //---]>
    // выделение и правки

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

    function isConnected(nodeId: string, pin: string, dir: PinDir) {
        return graph.value.connections.some((c) => (dir === 'in' ? c.to.node === nodeId && c.to.pin === pin : c.from.node === nodeId && c.from.pin === pin));
    }

    function setValue(nodeId: string, pin: string, value: number | number[]) {
        const node = graph.value.nodes[nodeId];
        if (node) node.values[pin] = value;
    }

    function setParam(nodeId: string, key: string, value: string) {
        const node = graph.value.nodes[nodeId];
        if (node) node.params = { ...node.params, [key]: value };
    }

    /** Кладёт картинку в граф под свободным именем (по подсказке) и выбирает её в параметре ноды. */
    function importTexture(nodeId: string, key: string, nameHint: string, src: string) {
        const textures = (graph.value.textures ??= {});
        const base = nameHint.replace(/\.[^.]+$/, '').trim() || 'texture';
        let name = base;
        for (let i = 2; name in textures; i++) name = `${base} ${i}`;
        textures[name] = { src };
        setParam(nodeId, key, name);
    }

    /** Мировые координаты центра пина или null, если ещё не измерен. */
    function pinWorld(ref: PinRef, dir: PinDir): [number, number] | null {
        return pins.world(graph.value.nodes[ref.node], dir, ref.pin);
    }

    /** Выведенный тип пина (для цвета и редактора значения). */
    function pinType(ref: PinRef, dir: PinDir) {
        const node = resolved.value.nodes[ref.node];
        return dir === 'in' ? node?.inputs[ref.pin] : node?.outputs[ref.pin];
    }

    /** Показать весь граф: камера подбирается под границы нод (по оценке размеров) и размер холста. */
    function fitView() {
        const nodes = Object.values(graph.value.nodes);
        if (nodes.length === 0) {
            camera.value = createCamera();
            return;
        }
        const left = Math.min(...nodes.map((n) => n.x));
        const top = Math.min(...nodes.map((n) => n.y));
        const right = Math.max(...nodes.map((n) => n.x + NODE_ESTIMATE.w));
        const bottom = Math.max(...nodes.map((n) => n.y + NODE_ESTIMATE.h));
        const { w, h } = viewport.value;
        const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((w - FIT_PADDING * 2) / (right - left), (h - FIT_PADDING * 2) / (bottom - top))));
        camera.value = { x: (w - (right - left) * z) / 2 - left * z, y: (h - (bottom - top) * z) / 2 - top * z, z };
    }

    //---]>
    // протягивание связи

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

    //---]>
    // документ: история, автосохранение, файлы (механика в taoux/session)

    const session = createDocumentSession<EditorDoc, MessageKey>({
        document: {
            get: () => ({ graph: graph.value, system: system.value }),
            set: (next) => {
                graph.value = next.graph;
                system.value = next.system;
            },
        },
        camera: { get: () => camera.value, set: (next) => (camera.value = next) },
        storage,
        codec: {
            serialize: serializeDoc,
            parse: (text) => parseDoc(text, registry),
        },
        empty: emptyDoc,
        countNodes: (d) => Object.keys(d.graph.nodes).length,
        keys: {
            loaded: 'file.loaded',
            loadedWithDropped: 'file.loadedWithDropped',
            newDocument: 'file.newGraph',
            saveFailed: 'file.error.saveFailed',
            restoreFailed: 'file.error.restoreFailed',
            loadError: (code) => `file.error.${code}` as MessageKey,
        },
        onReset() {
            selection.clear();
            selectedConnection.value = null;
            pending.value = null;
            palette.value = null;
        },
        onRestore(d) {
            // Выделение и незавершённые действия не входят в историю, но не должны ссылаться на исчезнувшее.
            for (const id of [...selection]) if (!d.graph.nodes[id]) selection.delete(id);
            if (selectedConnection.value && !d.graph.connections.some((c) => c.id === selectedConnection.value)) selectedConnection.value = null;
            pending.value = null;
            palette.value = null;
        },
    });

    const { notice, showNotice, canUndo, canRedo, commit, undo, redo, recorded, exportText, importText, restoreSaved, startAutosave, flushSave } = session;
    const loadGraph = session.load;
    const newGraph = session.newDocument;

    //---]>
    // система частиц

    /** Ключ параметров системы: меняется, когда частицы нужно пересобрать. */
    const systemKey = computed(() => JSON.stringify(system.value));

    /** Правит параметры системы; серия правок одного `key` склеивается в один шаг истории. */
    function updateSystem(key: string, change: (s: SystemDef) => void) {
        if (!system.value) return;
        change(system.value);
        commit(`system:${key}`);
    }

    watch(
        () => (system.value ? timelineLength(system.value) : null),
        (length) => {
            if (length) clip.setLength(length);
        },
        { immediate: true },
    );
    watch(
        () => system.value !== null,
        (isParticles) => (isParticles ? clip.play() : clip.pause()),
        { immediate: true },
    );

    /** Включает частицы в текущем документе: материал остаётся, добавляются параметры по умолчанию. */
    function enableParticles() {
        if (system.value) return;
        system.value = defaultSystem();
        clip.restart();
        commit();
    }

    /** Возвращает документ к обычному материалу. */
    function disableParticles() {
        if (!system.value) return;
        system.value = null;
        commit();
    }

    /** Заменяет документ стартовой системой частиц (фонтан); отменяется как обычная правка. */
    function startParticles() {
        loadGraph(JSON.parse(JSON.stringify(DEMO_PARTICLES)) as EditorDoc, { x: 0, y: 0, z: 1 });
        clip.restart();
        nextTickFit = true;
    }
    let nextTickFit = false;
    const takeFitRequest = () => {
        const v = nextTickFit;
        nextTickFit = false;
        return v;
    };

    //---]>
    // палитра нод

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

        setSelection([node.id]);
        selectedConnection.value = null;
        palette.value = null;
    }

    /** Ставит ноду в центр видимой области и выделяет её. */
    function addNodeAtCenter(type: string) {
        const [x, y] = screenToWorld(camera.value, viewport.value.w / 2, viewport.value.h / 2);
        const node = addNode(graph.value, registry, type, { x: Math.round(x), y: Math.round(y) });
        setSelection([node.id]);
        selectedConnection.value = null;
        return node;
    }

    return {
        registry,
        graph,
        system,
        systemKey,
        playback,
        /** Перемотка предпросмотра на `time` секунд. */
        seek: clip.seek,
        /** Включает и выключает воспроизведение предпросмотра. */
        setPlaying: (on: boolean) => (on ? clip.play() : clip.pause()),
        updateSystem,
        enableParticles,
        disableParticles,
        startParticles,
        takeFitRequest,
        camera,
        selection,
        selectedConnection,
        pending,
        palette,
        viewport,
        resolved,
        compileErrors,
        setCompileErrors,
        structureKey,
        notice,
        canUndo,
        canRedo,

        showNotice,
        exportText,
        importText,
        newGraph,
        loadGraph,
        restoreSaved,
        startAutosave,
        flushSave,

        commit,
        undo,
        redo,

        setSelection,
        toggleSelected,
        selectConnection,
        moveSelected,
        removeSelected: recorded(removeSelected),
        isConnected,
        setValue: recorded(setValue, (nodeId, pin) => `value:${nodeId}:${pin}`),
        setParam: recorded(setParam),
        importTexture: recorded(importTexture),
        setPinOffsets: pins.set,
        clearPinOffsets: pins.clear,
        pinWorld,
        pinType,
        fitView,

        startConnect,
        updateConnect,
        cancelConnect,
        finishConnect: recorded(finishConnect),

        openPalette,
        closePalette,
        fitsPaletteOrigin,
        createFromPalette: recorded(createFromPalette),
        addNodeAtCenter: recorded(addNodeAtCenter),
    };
});
