// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { layout } from '@/editor/layout';
import { useEditor } from '@/editor/store';
import { createProject } from '@/project/project';
import { packProject } from '@/project/archive';

const file = (content: string | Uint8Array, name: string) => new File([content as BlobPart], name);
const tabIds = (editor: ReturnType<typeof useEditor>) => editor.tabs.map((t) => `${t.docId}${t.preview ? '*' : ''}`);
const noDownload = () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
};

beforeEach(() => {
    localStorage.clear();
    layout.view = 'preview';
    setActivePinia(createPinia());
});
afterEach(() => vi.restoreAllMocks());

/** Проект из трёх документов; все вкладки закрыты. */
function three() {
    const editor = useEditor();
    const a = editor.createDocument('effect')!;
    const b = editor.createDocument('effect')!;
    const c = editor.createDocument('material')!;
    editor.closeAllTabs();
    return { editor, a, b, c };
}

describe('вкладки: у каждого документа своё', () => {
    it('история правок: уйти к другому документу и вернуться, и отмена откатывает правку первого, а не второго', () => {
        const editor = useEditor();
        const a = editor.createDocument('effect')!;
        const originalSeed = editor.system!.seed;
        editor.updateSystem('seed', (s) => (s.seed = 111));
        const b = editor.createDocument('effect')!;
        expect(editor.canUndo).toBe(false); // у нового документа своя, пустая история
        editor.updateSystem('seed', (s) => (s.seed = 222));

        editor.openDocument(a);
        expect(editor.system!.seed).toBe(111);
        expect(editor.canUndo).toBe(true);
        editor.undo();
        expect(editor.system!.seed).toBe(originalSeed);
        expect(editor.canRedo).toBe(true);

        editor.openDocument(b);
        expect(editor.system!.seed).toBe(222);
        editor.undo();
        expect(editor.system!.seed).not.toBe(222);

        editor.openDocument(a);
        expect(editor.canRedo).toBe(true); // и возврат в первый не потерял redo
    });

    it('камера и вид («Граф» или «Превью») возвращаются каждому документу', () => {
        const editor = useEditor();
        const a = editor.createDocument('effect')!;
        editor.camera = { x: 500, y: -300, z: 1.4 };
        layout.view = 'graph';
        const b = editor.createDocument('effect')!;
        layout.view = 'preview';
        editor.camera = { x: -7, y: 8, z: 0.9 };

        editor.openDocument(a);
        expect(editor.camera).toEqual({ x: 500, y: -300, z: 1.4 });
        expect(layout.view).toBe('graph');
        editor.openDocument(b);
        expect(editor.camera).toEqual({ x: -7, y: 8, z: 0.9 });
        expect(layout.view).toBe('preview');
    });

    it('время на таймлайне возвращается документу', () => {
        const editor = useEditor();
        const a = editor.createDocument('effect')!;
        editor.seek(1.25);
        const b = editor.createDocument('effect')!;
        editor.seek(0.4);
        editor.openDocument(a);
        expect(editor.playback.time).toBeCloseTo(1.25, 2);
        editor.openDocument(b);
        expect(editor.playback.time).toBeCloseTo(0.4, 2);
    });

    it('«не сохранено» у вкладки: у открытой живой флаг, у ушедшей запомненный; сохранение снимает у всех', async () => {
        noDownload();
        const editor = useEditor();
        const a = editor.createDocument('effect')!;
        const b = editor.createDocument('effect')!;
        editor.updateSystem('seed', (s) => (s.seed = 5)); // правка в «b»
        expect(editor.docDirty).toBe(true);
        editor.openDocument(a);
        const flags = () => Object.fromEntries(editor.tabs.map((t) => [t.docId, t.docId === editor.openDocId ? editor.docDirty : t.dirty]));
        expect(flags()).toEqual({ [a]: false, [b]: true });
        editor.openDocument(b);
        expect(editor.docDirty).toBe(true); // вернулась вместе с документом

        await editor.saveProject();
        expect(editor.docDirty).toBe(false);
        editor.openDocument(a);
        editor.openDocument(b);
        expect(editor.docDirty).toBe(false);
        expect(editor.tabs.every((t) => !t.dirty)).toBe(true);
    });

    it('сохранение снимает «не сохранено» и у документа, который в этот момент не на экране', async () => {
        noDownload();
        const editor = useEditor();
        const a = editor.createDocument('effect')!;
        const b = editor.createDocument('effect')!;
        editor.openDocument(a);
        editor.updateSystem('seed', (s) => (s.seed = 8));
        editor.openDocument(b); // «a» ушёл с экрана с несохранённой правкой
        expect(editor.tabs.find((t) => t.docId === a)!.dirty).toBe(true);
        await editor.saveProject();
        expect(editor.tabs.find((t) => t.docId === a)!.dirty).toBe(false);
        editor.openDocument(a);
        expect(editor.docDirty).toBe(false);
    });

    it('вернувшийся документ не подбирает камеру заново, новый подбирает', () => {
        const editor = useEditor();
        const a = editor.createDocument('effect')!;
        const b = editor.createDocument('effect')!;
        editor.takeGraphFit();
        editor.openDocument(a);
        expect(editor.takeGraphFit()).toBe(false); // камеру вернула вкладка
        editor.closeAllTabs();
        editor.takeGraphFit();
        editor.openDocument(b);
        expect(editor.takeGraphFit()).toBe(true); // у открытого впервые камеры нет: подбирается по размеру холста
    });
});

describe('вкладки: открытие и предпросмотр', () => {
    it('созданные документы закреплены, у каждого своя вкладка', () => {
        const editor = useEditor();
        const a = editor.createDocument('effect')!;
        const b = editor.createDocument('material')!;
        expect(tabIds(editor)).toEqual([a, b]);
        expect(editor.openDocId).toBe(b);
    });

    it('открытие предпросмотром заменяет прежний предпросмотр, закреплённые не трогает', () => {
        const { editor, a, b, c } = three();
        expect(editor.tabs).toEqual([]);
        editor.openDocument(a, true);
        expect(tabIds(editor)).toEqual([`${a}*`]);
        editor.openDocument(b, true);
        expect(tabIds(editor)).toEqual([`${b}*`]); // «a» заменён
        editor.pinTab(b);
        editor.openDocument(c, true);
        expect(tabIds(editor)).toEqual([b, `${c}*`]);
    });

    it('правка предпросмотра закрепляет его вкладку', async () => {
        const { editor, a, b } = three();
        editor.openDocument(a, true);
        editor.updateSystem('seed', (s) => (s.seed = 9));
        await nextTick();
        expect(tabIds(editor)).toEqual([a]);
        editor.openDocument(b, true);
        expect(tabIds(editor)).toEqual([a, `${b}*`]);
    });

    it('закреплённое открытие закрепляет уже открытый предпросмотр', () => {
        const { editor, a } = three();
        editor.openDocument(a, true);
        editor.openDocument(a);
        expect(tabIds(editor)).toEqual([a]);
    });

    it('переход по вкладке не закрепляет и не создаёт лишнего: заново открыть открытую можно, вкладок не прибавится', () => {
        const { editor, a, b } = three();
        editor.openDocument(a);
        editor.openDocument(b);
        editor.openDocument(a);
        editor.openDocument(a);
        expect(tabIds(editor)).toEqual([a, b]);
    });

    it('порядок вкладок меняется', () => {
        const { editor, a, b, c } = three();
        [a, b, c].forEach((id) => editor.openDocument(id));
        editor.moveTab(0, 2);
        expect(tabIds(editor)).toEqual([b, c, a]);
    });

    it('черновик (заготовка при запуске, правленная) получает вкладку, когда становится файлом', () => {
        const editor = useEditor();
        expect(editor.tabs).toEqual([]);
        editor.setValue('mask', 'low', 0.2); // правленная заготовка: файла ещё нет
        expect(editor.openDocId).toBeNull();
        const other = editor.createDocument('effect')!;
        expect(editor.tabs).toHaveLength(2);
        expect(editor.tabs[1]!.docId).toBe(other);
    });

    it('открытый файл прежнего вида сразу документ проекта со своей вкладкой, и проект от этого не «грязный»', async () => {
        const editor = useEditor();
        await editor.openFile(file(editor.exportText(), 'old.json'));
        expect(editor.tabs).toHaveLength(1);
        expect(editor.openDocId).toBe(editor.tabs[0]!.docId);
        expect(editor.dirty).toBe(false);
    });

    it('открытие другого проекта или файла прежнего вида заменяет вкладки, а не дописывает к прежним', async () => {
        const editor = useEditor();
        editor.createDocument('effect');
        editor.createDocument('material');
        noDownload();
        await editor.saveProject();
        const bytes = await packProject(editor.project);
        const legacy = editor.exportText();

        setActivePinia(createPinia());
        const other = useEditor();
        other.createDocument('effect');
        other.createDocument('effect');
        other.createDocument('material');
        expect(other.tabs).toHaveLength(3);
        await other.openFile(file(bytes, 'p.taofx'));
        expect(other.tabs).toHaveLength(1);

        other.createDocument('effect');
        expect(other.tabs).toHaveLength(2);
        await other.openFile(file(legacy, 'old.json'));
        expect(other.tabs).toHaveLength(1);
    });

    it('открытый проект .taofx начинается с одной вкладки, «Новый проект» и пустой проект без вкладок', async () => {
        const project = createProject({ name: 'p' });
        const editor = useEditor();
        const a = editor.createDocument('effect')!;
        editor.createDocument('material');
        noDownload();
        await editor.saveProject();
        const bytes = await packProject(editor.project);

        setActivePinia(createPinia());
        const reopened = useEditor();
        await reopened.openFile(file(bytes, 'p.taofx'));
        expect(reopened.tabs).toHaveLength(1);
        expect(reopened.tabs[0]!.docId).toBe(a);

        reopened.newProject();
        expect(reopened.tabs).toEqual([]);

        await reopened.openFile(file(await packProject(project), 'empty.taofx'));
        expect(reopened.tabs).toEqual([]);
    });
});

describe('вкладки: закрытие', () => {
    it('закрытая вкладка отдаёт экран соседней справа, а крайняя левой; документ остаётся в проекте', () => {
        const { editor, a, b, c } = three();
        [a, b, c].forEach((id) => editor.openDocument(id));
        editor.closeTab(b); // не открытая (открыта «c»): просто убрана
        expect(tabIds(editor)).toEqual([a, c]);
        expect(editor.openDocId).toBe(c);
        editor.closeTab(c); // открытая, справа никого: слева «a»
        expect(editor.openDocId).toBe(a);
        expect(tabIds(editor)).toEqual([a]);
        expect(editor.project.find(b)).toBeDefined(); // закрыта вкладка, не документ
        expect(editor.project.find(c)).toBeDefined();
    });

    it('закрытие открытой вкладки записывает её правки в проект, а при повторном открытии они на месте', () => {
        const { editor, a, b } = three();
        editor.openDocument(a);
        editor.updateSystem('seed', (s) => (s.seed = 4242));
        editor.openDocument(b);
        editor.openDocument(a);
        editor.closeTab(a);
        editor.openDocument(a);
        expect(editor.system!.seed).toBe(4242);
    });

    it('закрытие неоткрытой вкладки не трогает открытый документ: его история остаётся', () => {
        const { editor, a, b } = three();
        [a, b].forEach((id) => editor.openDocument(id));
        editor.updateSystem('seed', (s) => (s.seed = 31));
        editor.closeTab(a);
        expect(editor.openDocId).toBe(b);
        expect(editor.canUndo).toBe(true);
        expect(editor.system!.seed).toBe(31);
    });

    it('правка, сделанная после возвращения на вкладку, не теряется ни при закрытии вкладки, ни при «закрыть все»', () => {
        const { editor, a, b } = three();
        [a, b].forEach((id) => editor.openDocument(id));
        editor.openDocument(a);
        editor.updateSystem('seed', (s) => (s.seed = 5151));
        editor.closeTab(a);
        editor.openDocument(a);
        expect(editor.system!.seed).toBe(5151);

        editor.updateSystem('seed', (s) => (s.seed = 6262));
        editor.closeAllTabs();
        editor.openDocument(a);
        expect(editor.system!.seed).toBe(6262);
    });

    it('закрыта открытая вкладка, а соседний документ не открывается (повреждён): экран пустой, а не закрытый документ', () => {
        const { editor, b, c } = three();
        editor.openDocument(c);
        editor.openDocument(b);
        editor.project.writeDoc(c, { graph: { nodes: { x: { id: 'x', type: 'нет/такой', x: 0, y: 0, values: {} } }, connections: [] } });
        editor.closeTab(b);
        expect(editor.notice).toMatchObject({ kind: 'error' });
        expect(editor.openDocId).toBeNull();
        expect(editor.tabs.map((t) => t.docId)).not.toContain(b);
    });

    it('закрыта единственная вкладка: открывается пустой документ без файла, проект не тронут', () => {
        const { editor, a } = three();
        editor.openDocument(a);
        editor.closeTab(a);
        expect(editor.tabs).toEqual([]);
        expect(editor.openDocId).toBeNull();
        expect(Object.keys(editor.graph.nodes)).toHaveLength(0);
        expect(editor.project.resources).toHaveLength(3);
    });

    it('«закрыть остальные» оставляет одну, «закрыть все» ни одной', () => {
        const { editor, a, b, c } = three();
        [a, b, c].forEach((id) => editor.openDocument(id));
        editor.closeOtherTabs(b);
        expect(tabIds(editor)).toEqual([b]);
        expect(editor.openDocId).toBe(b);
        editor.closeAllTabs();
        expect(editor.tabs).toEqual([]);
        expect(editor.openDocId).toBeNull();
    });

    it('«закрыть остальные» для чужого id ничего не закрывает', () => {
        const { editor, a, b } = three();
        [a, b].forEach((id) => editor.openDocument(id));
        editor.closeOtherTabs('нет');
        expect(tabIds(editor)).toEqual([a, b]);
    });

    it('удалённый документ уходит и из вкладок: экран получает соседа; неоткрытый просто убирается', () => {
        const { editor, a, b, c } = three();
        [a, b, c].forEach((id) => editor.openDocument(id));
        editor.deleteResource(a, true);
        expect(tabIds(editor)).toEqual([b, c]);
        expect(editor.openDocId).toBe(c);
        editor.deleteResource(c, true);
        expect(tabIds(editor)).toEqual([b]);
        expect(editor.openDocId).toBe(b);
        editor.deleteResource(b, true);
        expect(editor.tabs).toEqual([]);
        expect(editor.openDocId).toBeNull();
    });
});
