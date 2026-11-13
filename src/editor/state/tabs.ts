import type { HistoryState } from '@1337exp/taoux/history';
import { ref } from 'vue';
import type { CenterView } from '../layout';

/** Вкладка в том виде, как её видит интерфейс. */
export interface TabInfo {
    docId: string;
    /** Предпросмотр: курсивом, следующий предпросмотр занимает его место, правка или двойной клик закрепляют. */
    preview: boolean;
    /** Есть правки, не записанные в файл проекта. У открытого документа берётся живой флаг, это значение у остальных. */
    dirty: boolean;
}

/** Всё, что у документа своё и должно пережить его уход с экрана. */
interface Stash {
    history: HistoryState;
    camera: { x: number; y: number; z: number };
    view: CenterView;
    time: number;
    dirty: boolean;
}

/** От чего зависят вкладки: то, что редактор держит один на всех и что у каждого документа должно быть своё. */
export interface TabsDeps {
    saveHistory(): HistoryState;
    restoreHistory(history: HistoryState): void;
    getCamera(): { x: number; y: number; z: number };
    setCamera(camera: { x: number; y: number; z: number }): void;
    getView(): CenterView;
    setView(view: CenterView): void;
    getTime(): number;
    seek(time: number): void;
    getDirty(): boolean;
    setDirty(dirty: boolean): void;
}

/**
 * Вкладки открытых документов. Редактор правит один документ за раз, а у остальных открытых вкладок остаются свои
 * история правок, камера, вид («Превью» или «Граф»), время на таймлайне и признак «не сохранено»: пока документ не на экране,
 * они лежат в памяти и возвращаются, когда вкладку выбирают снова.
 */
export function useTabs(deps: TabsDeps) {
    const tabs = ref<TabInfo[]>([]);
    const stash = new Map<string, Stash>();

    const find = (id: string) => tabs.value.find((t) => t.docId === id);
    const has = (id: string) => find(id) !== undefined;

    /**
     * Добавляет вкладку. Предпросмотр занимает место прежнего предпросмотра (и тот забывается), закреплённая встаёт в конец;
     * уже открытая остаётся на месте, а закреплённое открытие закрепляет и её.
     */
    function add(id: string, preview = false) {
        const existing = find(id);
        if (existing) {
            if (!preview) existing.preview = false;
            return;
        }
        const old = tabs.value.findIndex((t) => t.preview);
        if (preview && old >= 0) {
            stash.delete(tabs.value[old]!.docId);
            tabs.value.splice(old, 1, { docId: id, preview: true, dirty: false });
        } else {
            tabs.value.push({ docId: id, preview, dirty: false });
        }
    }

    /** Документ уходит с экрана: его история, камера, вид и время запоминаются. Без вкладки (черновик без файла) нечего хранить. */
    function leave(id: string | null) {
        const tab = id === null ? undefined : find(id);
        if (!id || !tab) return;
        const dirty = deps.getDirty();
        tab.dirty = dirty;
        stash.set(id, { history: deps.saveHistory(), camera: { ...deps.getCamera() }, view: deps.getView(), time: deps.getTime(), dirty });
    }

    /**
     * Документ вышел на экран (его уже подменили в редакторе, история пуста): вкладка есть, а если документ уже был открыт,
     * ему возвращается всё его. Верно, если запомненное вернулось.
     */
    function arrive(id: string, preview = false): boolean {
        add(id, preview);
        const saved = stash.get(id);
        if (!saved) return false;
        stash.delete(id);
        deps.restoreHistory(saved.history);
        deps.setCamera(saved.camera);
        deps.setView(saved.view);
        deps.seek(saved.time);
        deps.setDirty(saved.dirty);
        return true;
    }

    function pin(id: string) {
        const tab = find(id);
        if (tab) tab.preview = false;
    }

    function move(from: number, to: number) {
        const [tab] = tabs.value.splice(from, 1);
        if (tab) tabs.value.splice(to, 0, tab);
    }

    /** Убирает вкладку и всё запомненное о ней. Соседа, который займёт место закрытой, называет `neighbour` до удаления. */
    function remove(id: string) {
        const i = tabs.value.findIndex((t) => t.docId === id);
        if (i >= 0) tabs.value.splice(i, 1);
        stash.delete(id);
    }

    /** Вкладка, которая откроется вместо закрываемой: правая, а нет её, левая. */
    function neighbour(id: string): string | null {
        const i = tabs.value.findIndex((t) => t.docId === id);
        if (i < 0) return null;
        return (tabs.value[i + 1] ?? tabs.value[i - 1])?.docId ?? null;
    }

    function reset() {
        tabs.value = [];
        stash.clear();
    }

    /** Проект записан в файл: ни у одного документа нет несохранённого. */
    function markSaved() {
        tabs.value.forEach((t) => (t.dirty = false));
        stash.forEach((s) => (s.dirty = false));
    }

    return { tabs, has, add, leave, arrive, pin, move, remove, neighbour, reset, markSaved };
}

export type Tabs = ReturnType<typeof useTabs>;
