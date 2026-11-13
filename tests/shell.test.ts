// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LAYOUT, readLayout } from '@/editor/layout';
import { usePreviewState } from '@/editor/state/preview';
import { buildProjectTree, folderId } from '@/editor/projectTree';
import { useEditor } from '@/editor/store';
import type { Resource } from '@/project/project';

const res = (id: string, path: string, kind = 'material'): Resource => ({ id, kind, type: kind === 'image' ? 'asset' : 'doc', path, refs: [] });

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});
afterEach(() => vi.restoreAllMocks());

describe('раскладка оболочки', () => {
    it('пустое, чужое и старое сохранение даёт раскладку по умолчанию', () => {
        expect(readLayout(null)).toEqual(DEFAULT_LAYOUT);
        expect(readLayout('x')).toEqual(DEFAULT_LAYOUT);
        expect(readLayout({ nodesOpen: true, nodesSize: 62 })).toEqual(DEFAULT_LAYOUT); // формат до оболочки
    });

    it('годные поля читаются, негодные заменяются каждое своим умолчанием', () => {
        const l = readLayout({ left: 20, center: 80, stage: 60, leftStage: 50, view: 'graph', bottomTab: 'budget' });
        expect(l).toEqual({ left: 20, center: 80, stage: 60, leftStage: 50, view: 'graph', bottomTab: 'budget' });

        const bad = readLayout({ left: 99, center: 'a', stage: Number.NaN, leftStage: 1, view: 'timeline', bottomTab: 5 });
        expect(bad).toEqual(DEFAULT_LAYOUT);
        expect(readLayout({ left: 8 }).left).toBe(8);
        expect(readLayout({ left: 40 }).left).toBe(40);
        expect(readLayout({ left: 7.9 }).left).toBe(DEFAULT_LAYOUT.left);
        expect(readLayout({ left: 40.1 }).left).toBe(DEFAULT_LAYOUT.left);
    });
});

describe('дерево проекта', () => {
    it('пустой проект: пустое дерево', () => {
        expect(buildProjectTree([])).toEqual([]);
    });

    it('папки выводятся из путей, папки раньше файлов, внутри по имени', () => {
        const tree = buildProjectTree([
            res('a1', 'zeta.mat.json'),
            res('b2', 'textures/sheet.png', 'image'),
            res('c3', 'effects/boom.fx.json', 'effect'),
            res('d4', 'effects/ash.fx.json', 'effect'),
            res('e5', 'effects/deep/inner/x.mat.json'),
            res('f6', 'alpha.mat.json'),
        ]);
        expect(tree.map((n) => n.label)).toEqual(['effects', 'textures', 'alpha.mat.json', 'zeta.mat.json']);
        const effects = tree[0]!;
        expect(effects.id).toBe(folderId('effects'));
        expect(effects.children!.map((n) => n.label)).toEqual(['deep', 'ash.fx.json', 'boom.fx.json']);
        expect(effects.children![0]!.id).toBe('dir:effects/deep');
        expect(effects.children![0]!.children![0]).toMatchObject({ id: 'dir:effects/deep/inner', children: [{ id: 'e5', label: 'x.mat.json' }] });
    });

    it('у листа id ресурса, у картинки значок', () => {
        const [folder] = buildProjectTree([res('img1', 'textures/sheet.png', 'image'), res('doc1', 'textures/a.mat.json')]);
        expect(folder!.children).toEqual([
            { id: 'doc1', label: 'a.mat.json' },
            { id: 'img1', label: 'sheet.png', icon: 'tao-image' },
        ]);
    });
});

describe('стор: проект в оболочке', () => {
    it('сохранение записывает документ в проект: есть id документа и растёт счётчик дерева', async () => {
        vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:x');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

        const editor = useEditor();
        expect(editor.openDocId).toBeNull();
        const before = editor.projectRevision;
        await editor.saveProject();
        expect(editor.openDocId).not.toBeNull();
        expect(editor.projectRevision).toBeGreaterThan(before);
        expect(buildProjectTree(editor.project.resources).map((n) => n.label)).toEqual(['materials']);
    });

    it('новый проект сбрасывает открытый документ', async () => {
        vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:x');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
        const editor = useEditor();
        await editor.saveProject();
        editor.newProject();
        expect(editor.openDocId).toBeNull();
        expect(editor.project.resources).toEqual([]);
    });

    it('подбор камеры графа откладывается, пока граф не на экране, и выдаётся один раз', () => {
        const editor = useEditor();
        expect(editor.takeGraphFit()).toBe(true); // при запуске граф ещё не показан
        expect(editor.takeGraphFit()).toBe(false);
        editor.newProject();
        expect(editor.takeGraphFit()).toBe(true);
    });

    it('состояние превью по умолчанию', () => {
        const state = usePreviewState();
        expect(state.shape).toBe('sphere');
        expect(state.overdraw).toBe(false);
        expect(state.budget).toBeNull();
        expect(state.live).toEqual({ count: 0, simMs: 0 });
    });
});
