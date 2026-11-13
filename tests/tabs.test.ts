import { describe, expect, it, vi } from 'vitest';
import { useTabs, type TabsDeps } from '@/editor/state/tabs';

function setup() {
    const state = { camera: { x: 1, y: 2, z: 3 }, view: 'preview' as 'preview' | 'graph', time: 0.5, dirty: false };
    const history = { states: ['a', 'b'], index: 1 };
    const deps = {
        saveHistory: vi.fn(() => history),
        restoreHistory: vi.fn(),
        getCamera: () => state.camera,
        setCamera: vi.fn(),
        getView: () => state.view,
        setView: vi.fn(),
        getTime: () => state.time,
        seek: vi.fn(),
        getDirty: () => state.dirty,
        setDirty: vi.fn(),
    } satisfies TabsDeps;
    return { ...useTabs(deps), deps, state, history };
}
const ids = (t: ReturnType<typeof setup>) => t.tabs.value.map((x) => `${x.docId}${x.preview ? '*' : ''}`);

describe('вкладки: добавление и предпросмотр', () => {
    it('закреплённая встаёт в конец, повтор ничего не дублирует', () => {
        const t = setup();
        t.add('a');
        t.add('b');
        t.add('a');
        expect(ids(t)).toEqual(['a', 'b']);
        expect(t.has('a')).toBe(true);
        expect(t.has('zzz')).toBe(false);
    });

    it('предпросмотр занимает место прежнего предпросмотра, а не добавляется', () => {
        const t = setup();
        t.add('a');
        t.add('b', true);
        t.add('c');
        t.add('d', true);
        expect(ids(t)).toEqual(['a', 'd*', 'c']); // «b» заменён на месте
    });

    it('предпросмотр, когда другого предпросмотра нет, добавляется в конец', () => {
        const t = setup();
        t.add('a');
        t.add('b', true);
        expect(ids(t)).toEqual(['a', 'b*']);
    });

    it('закреплённое открытие закрепляет уже открытый предпросмотр, а предпросмотр закреплённой его не размораживает', () => {
        const t = setup();
        t.add('a', true);
        t.add('a', true); // тот же предпросмотр: ничего не меняется
        expect(ids(t)).toEqual(['a*']);
        t.add('a');
        expect(ids(t)).toEqual(['a']);
        t.add('a', true);
        expect(ids(t)).toEqual(['a']);
    });

    it('pin закрепляет, неизвестную вкладку не трогает', () => {
        const t = setup();
        t.add('a', true);
        t.pin('zzz');
        t.pin('a');
        expect(ids(t)).toEqual(['a']);
    });

    it('замена предпросмотра забывает всё запомненное о прежнем', () => {
        const t = setup();
        t.add('a', true);
        t.leave('a');
        t.add('b', true);
        expect(t.arrive('a')).toBe(false); // запомненное «a» пропало вместе с его вкладкой
    });
});

describe('вкладки: уход и возвращение документа', () => {
    it('уход запоминает историю, копию камеры, вид, время и «не сохранено»', () => {
        const t = setup();
        t.add('a');
        t.state.dirty = true;
        t.state.view = 'graph';
        t.leave('a');
        expect(t.deps.saveHistory).toHaveBeenCalledOnce();
        expect(t.tabs.value[0]!.dirty).toBe(true);

        t.state.camera.x = 999; // камера редактора пошла дальше: запомненная копия не изменилась
        expect(t.arrive('a')).toBe(true);
        expect(t.deps.restoreHistory).toHaveBeenCalledWith(t.history);
        expect(t.deps.setCamera).toHaveBeenCalledWith({ x: 1, y: 2, z: 3 });
        expect(t.deps.setView).toHaveBeenCalledWith('graph');
        expect(t.deps.seek).toHaveBeenCalledWith(0.5);
        expect(t.deps.setDirty).toHaveBeenCalledWith(true);
    });

    it('вернуть можно один раз: запомненное расходуется', () => {
        const t = setup();
        t.add('a');
        t.leave('a');
        expect(t.arrive('a')).toBe(true);
        t.deps.restoreHistory.mockClear();
        expect(t.arrive('a')).toBe(false);
        expect(t.deps.restoreHistory).not.toHaveBeenCalled();
    });

    it('документ без вкладки (черновик) и неизвестный при уходе ничего не запоминают', () => {
        const t = setup();
        t.leave(null);
        t.leave('нет');
        expect(t.deps.saveHistory).not.toHaveBeenCalled();
    });

    it('выход на экран новой вкладки добавляет её и ничего не восстанавливает', () => {
        const t = setup();
        expect(t.arrive('a')).toBe(false);
        expect(t.arrive('b', true)).toBe(false);
        expect(ids(t)).toEqual(['a', 'b*']);
        expect(t.deps.restoreHistory).not.toHaveBeenCalled();
        expect(t.deps.setCamera).not.toHaveBeenCalled();
    });

    it('выход на экран закрепляет вкладку, если открыли не предпросмотром', () => {
        const t = setup();
        t.add('a', true);
        t.arrive('a');
        expect(ids(t)).toEqual(['a']);
    });
});

describe('вкладки: порядок, закрытие, соседи', () => {
    it('move переставляет, как splice(to, 0, ...splice(from, 1))', () => {
        const t = setup();
        ['a', 'b', 'c', 'd'].forEach((id) => t.add(id));
        t.move(0, 2);
        expect(ids(t)).toEqual(['b', 'c', 'a', 'd']);
        t.move(3, 0);
        expect(ids(t)).toEqual(['d', 'b', 'c', 'a']);
        t.move(9, 0); // нет такой вкладки: ничего
        expect(ids(t)).toEqual(['d', 'b', 'c', 'a']);
    });

    it('сосед закрываемой: правый, а нет его, левый, а нет и его, никого', () => {
        const t = setup();
        ['a', 'b', 'c'].forEach((id) => t.add(id));
        expect(t.neighbour('b')).toBe('c');
        expect(t.neighbour('c')).toBe('b');
        expect(t.neighbour('a')).toBe('b');
        expect(t.neighbour('нет')).toBeNull();
        t.remove('b');
        t.remove('c');
        expect(t.neighbour('a')).toBeNull();
    });

    it('remove убирает вкладку и запомненное', () => {
        const t = setup();
        t.add('a');
        t.add('b');
        t.leave('a');
        t.remove('a');
        expect(ids(t)).toEqual(['b']);
        expect(t.arrive('a')).toBe(false);
        t.remove('нет'); // ничего
        expect(ids(t)).toEqual(['b', 'a']); // arrive выше добавил «a» заново; remove неизвестной ничего не сломал
    });

    it('reset очищает всё', () => {
        const t = setup();
        t.add('a');
        t.leave('a');
        t.reset();
        expect(t.tabs.value).toEqual([]);
        expect(t.arrive('a')).toBe(false);
    });

    it('markSaved снимает «не сохранено» и у вкладок, и у запомненного', () => {
        const t = setup();
        t.add('a');
        t.add('b');
        t.state.dirty = true;
        t.leave('a');
        t.leave('b');
        expect(t.tabs.value.every((x) => x.dirty)).toBe(true);
        t.markSaved();
        expect(t.tabs.value.some((x) => x.dirty)).toBe(false);
        t.arrive('a');
        expect(t.deps.setDirty).toHaveBeenLastCalledWith(false);
    });
});
