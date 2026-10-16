import { createCamera, type Camera } from '@1337exp/taoux/camera';
import { createPinRegistry } from '@1337exp/taoux/pins';
import { createDocumentSession, type SessionNotice } from '@1337exp/taoux/session';
import { defineStore } from 'pinia';
import { computed, markRaw, ref } from 'vue';
import { DEMO_GRAPH } from '@/demo';
import type { SystemDef } from '@/particles/types';
import { emptyDoc, parseDoc, serializeDoc, type EditorDoc } from './doc';
import { resolveTypes, type GraphError } from '@/graph/resolve';
import type { Graph, PinRef } from '@/graph/types';
import type { MessageKey } from '@/i18n';
import { createDefaultRegistry } from '@/nodes';
import { storage } from './persistence';
import { useConnectionDraft } from './state/connection';
import { usePalette } from './state/palette';
import { useParticleDoc } from './state/particles';
import { useSelection } from './state/selection';
import type { PinDir } from './state/types';
import { fitCamera } from './state/view';

export type { PaletteState, PendingConnection, PinDir, PinTarget } from './state/types';

/** Короткое сообщение пользователю (результат открытия файла и т.п.). Хранит ключ перевода. */
export type Notice = SessionNotice<MessageKey>;

const cloneDemo = (): Graph => JSON.parse(JSON.stringify(DEMO_GRAPH));

/**
 * Состояние редактора. Стор только собирает части: модель документа (граф, система частиц, камера, пины) лежит здесь,
 * а выделение, протягивание связи, палитра и частицы с воспроизведением это отдельные модули в `state/`.
 */
export const useEditor = defineStore('editor', () => {
    const registry = markRaw(createDefaultRegistry());
    const graph = ref<Graph>(cloneDemo());
    /** Параметры системы частиц; null: документ это обычный материал. */
    const system = ref<SystemDef | null>(null);
    const camera = ref<Camera>(createCamera());

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
    // модули состояния

    const sel = useSelection(graph);
    const connection = useConnectionDraft(graph, registry);

    /** Выведенный тип пина (для цвета и редактора значения). */
    function pinType(ref: PinRef, dir: PinDir) {
        const node = resolved.value.nodes[ref.node];
        return dir === 'in' ? node?.inputs[ref.pin] : node?.outputs[ref.pin];
    }

    const paletteState = usePalette({ graph, registry, camera, viewport, pinType, select: sel.setSelection, selectConnection: sel.selectConnection });

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
            sel.reset();
            connection.reset();
            paletteState.closePalette();
        },
        onRestore(d) {
            // Выделение и незавершённые действия не входят в историю, но не должны ссылаться на исчезнувшее.
            sel.prune(d.graph);
            connection.reset();
            paletteState.closePalette();
        },
    });

    const { notice, showNotice, canUndo, canRedo, commit, undo, redo, recorded, exportText, importText, restoreSaved, startAutosave, flushSave } = session;

    const particles = useParticleDoc({ system, commit, load: session.load });

    //---]>
    // правки ноды

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

    /** Показать весь граф: камера подбирается под границы нод (по оценке размеров) и размер холста. */
    function fitView() {
        camera.value = fitCamera(Object.values(graph.value.nodes), viewport.value);
    }

    return {
        registry,
        graph,
        system,
        camera,
        viewport,
        resolved,
        compileErrors,
        setCompileErrors,
        structureKey,

        // документ
        notice,
        canUndo,
        canRedo,
        showNotice,
        exportText,
        importText,
        newGraph: session.newDocument,
        loadGraph: session.load,
        restoreSaved,
        startAutosave,
        flushSave,
        commit,
        undo,
        redo,

        // выделение
        selection: sel.selection,
        selectedConnection: sel.selectedConnection,
        setSelection: sel.setSelection,
        toggleSelected: sel.toggleSelected,
        selectConnection: sel.selectConnection,
        moveSelected: sel.moveSelected,
        removeSelected: recorded(sel.removeSelected),

        // правки ноды и пины
        isConnected,
        setValue: recorded(setValue, (nodeId, pin) => `value:${nodeId}:${pin}`),
        setParam: recorded(setParam),
        importTexture: recorded(importTexture),
        setPinOffsets: pins.set,
        clearPinOffsets: pins.clear,
        pinWorld,
        pinType,
        fitView,

        // протягивание связи
        pending: connection.pending,
        startConnect: connection.startConnect,
        updateConnect: connection.updateConnect,
        cancelConnect: connection.cancelConnect,
        finishConnect: recorded(connection.finishConnect),

        // палитра
        palette: paletteState.palette,
        openPalette: paletteState.openPalette,
        closePalette: paletteState.closePalette,
        fitsPaletteOrigin: paletteState.fitsPaletteOrigin,
        createFromPalette: recorded(paletteState.createFromPalette),
        addNodeAtCenter: recorded(paletteState.addNodeAtCenter),

        // частицы и воспроизведение
        playback: particles.playback,
        systemKey: particles.systemKey,
        seek: particles.seek,
        setPlaying: particles.setPlaying,
        updateSystem: particles.updateSystem,
        enableParticles: particles.enableParticles,
        disableParticles: particles.disableParticles,
        startParticles: particles.startParticles,
        takeFitRequest: particles.takeFitRequest,
    };
});
