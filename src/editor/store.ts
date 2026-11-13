import { createCamera, type Camera } from '@1337exp/taoux/camera';
import { createPinRegistry } from '@1337exp/taoux/pins';
import { downloadBlob, MAX_FILE_BYTES, readBytesFile } from '@1337exp/taoux/file';
import { createDocumentSession, type SessionNotice } from '@1337exp/taoux/session';
import type { SavedStorage } from '@1337exp/taoux/storage';
import { looksLikeZip } from '@1337exp/taoux/zip';
import { defineStore } from 'pinia';
import { computed, markRaw, ref, shallowRef } from 'vue';
import { DEMO_GRAPH } from '@/demo';
import type { SystemDef } from '@/particles/types';
import { emptyDoc, parseDoc, serializeDoc, type EditorDoc } from './doc';
import { packProject, PROJECT_EXTENSION, PROJECT_MIME, unpackProject } from '@/project/archive';
import { createProject, type Project } from '@/project/project';
import { emptyLink, loadProjectDoc, saveProjectDoc, type ProjectLink } from './projectFile';
import { resolveTypes, type GraphError } from '@/graph/resolve';
import type { Graph, PinRef } from '@/graph/types';
import type { MessageKey } from '@/i18n';
import { createDefaultRegistry } from '@/nodes';
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
 * Проект живёт только в памяти (решение: docs/project.ru.md), сессии документа хранилище не нужно. Она требует его в
 * настройках, но без `startAutosave` и `restoreSaved` не трогает.
 */
const noStorage: SavedStorage = { read: () => null, write: () => true, backupBroken: () => {} };

/** Имя файла из названия проекта: без знаков, которых нет в именах на Windows. */
const fileBaseOf = (name: string) => name.trim().replace(/[\\/:*?"<>|\x00-\x1f]+/g, '_').replace(/[. ]+$/, '') || 'project';
const stemOf = (fileName: string) => fileName.replace(/\.(taofx|json)$/i, '');

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
        storage: noStorage,
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

    const { notice, showNotice, canUndo, canRedo, dirty, commit, undo, redo, recorded, exportText } = session;

    //---]>
    // проект: файлы в памяти, открытие и сохранение (решения: docs/project.ru.md)

    /** Проект, в котором лежит открытый документ. Сам не реактивен (это файлы), его замена видна через `projectName`. */
    const project = shallowRef<Project>(markRaw(createProject()));
    /** Как открытый документ лежит в проекте (какой это файл, какая картинка какому ассету). */
    let link: ProjectLink = emptyLink();
    const projectName = ref('');

    function useProject(next: Project, nextLink: ProjectLink) {
        project.value = markRaw(next);
        link = nextLink;
        projectName.value = next.manifest.name;
    }

    /** Открытый документ целиком: вид из файла сохранён при другом размере окна, а у файла без вида камера осталась бы от прежнего графа. */
    function showOpened(items: number, dropped: number, problems: number) {
        fitView();
        if (problems > 0) showNotice('error', 'file.loadedWithProblems', [items, problems]);
        else if (dropped > 0) showNotice('error', 'file.loadedWithDropped', [items, dropped]);
        else showNotice('info', 'file.loaded', [items]);
    }

    const refuse = (code: string, detail?: string | number) => showNotice('error', `file.error.${code}` as MessageKey, detail === undefined ? undefined : [detail]);

    /** Пустой проект и пустой документ; текущие несохранённые правки отбрасываются (спрашивает интерфейс). */
    function newProject() {
        useProject(createProject(), emptyLink());
        session.load(emptyDoc(), { x: 0, y: 0, z: 1 }, true);
        showNotice('info', 'file.newGraph');
    }

    async function openProjectBytes(bytes: Uint8Array, name: string) {
        const unpacked = await unpackProject(bytes);
        if (!unpacked.ok) return refuse(unpacked.error, unpacked.detail);
        const opened = loadProjectDoc(unpacked.project, registry);
        if (!opened.ok) return refuse(opened.error.code, opened.error.detail);

        const { doc, view, link: docLink, dropped, missingAssets } = opened.loaded;
        if (unpacked.project.manifest.name === '' && name !== '') unpacked.project.setManifest({ name });
        unpacked.project.markSaved();
        useProject(unpacked.project, docLink);
        session.load(doc, view, true);
        showOpened(Object.keys(doc.graph.nodes).length, dropped, unpacked.project.problems.length + missingAssets);
    }

    /** Файл прежнего вида (`taofx` или `taofx-particles`): открывается как документ нового проекта, при сохранении станет проектом. */
    function openLegacyText(text: string, name: string) {
        const parsed = parseDoc(text, registry);
        if (!parsed.ok) return refuse(parsed.error.code, parsed.error.detail);
        useProject(createProject({ name: name === 'taofx' ? '' : name }), emptyLink());
        session.load(parsed.doc, parsed.view, true);
        showOpened(Object.keys(parsed.doc.graph.nodes).length, parsed.dropped, 0);
    }

    /** Открывает выбранный файл: проект `.taofx` (zip) или прежний `.json`. Какой это файл, решают по содержимому, а не по имени. */
    async function openFile(file: Blob & { name?: string }) {
        const read = await readBytesFile(file);
        if (!read.ok) return refuse(read.error);
        const name = stemOf(file.name ?? '');
        if (looksLikeZip(read.data)) return openProjectBytes(read.data, name);
        if (read.data.length > MAX_FILE_BYTES) return refuse('tooLarge');
        openLegacyText(new TextDecoder().decode(read.data), name);
    }

    /** Записывает документ в проект и отдаёт файл `.taofx`. «Не сохранено» снимается, когда файл отдан. */
    async function saveProject(): Promise<boolean> {
        try {
            const p = project.value;
            link = saveProjectDoc(p, { graph: graph.value, system: system.value }, { x: camera.value.x, y: camera.value.y, z: camera.value.z }, link, p.manifest.name);
            downloadBlob(fileBaseOf(p.manifest.name) + PROJECT_EXTENSION, await packProject(p), PROJECT_MIME);
            p.markSaved();
            session.markSaved();
            showNotice('info', 'file.saved');
            return true;
        } catch {
            showNotice('error', 'file.error.saveFailed');
            return false;
        }
    }

    const particles = useParticleDoc({
        system,
        commit,
        load: (doc, view) => {
            session.load(doc, view);
            fitView();
        },
    });

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
        dirty,
        project,
        projectName,
        /** Файл для игры: прежний `taofx.json` (граф или система частиц с картинками внутри). */
        exportText,
        newProject,
        openFile,
        saveProject,
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
