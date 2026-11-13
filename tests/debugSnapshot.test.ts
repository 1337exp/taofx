import { describe, expect, it, vi } from 'vitest';
import { createSnapshotter, type Snapshot, type SnapshotHost, type SnapshotStore } from '@/editor/debugSnapshot';

function memoryStore(initial: Snapshot | null = null) {
    let value = initial;
    const store: SnapshotStore = {
        read: vi.fn(async () => value),
        write: vi.fn(async (s: Snapshot) => void (value = s)),
        clear: vi.fn(async () => void (value = null)),
    };
    return { store, current: () => value };
}

function fakeHost(over: Partial<SnapshotHost> = {}) {
    const state = { dirty: false, revision: 0, bytes: new Uint8Array([1, 2, 3]), tabs: ['a', 'b'], active: 'b' as string | null };
    const host: SnapshotHost = {
        dirty: () => state.dirty,
        revision: () => state.revision,
        pack: vi.fn(async () => state.bytes),
        tabs: () => state.tabs,
        active: () => state.active,
        open: vi.fn(async () => {
            state.revision++; // открытие проекта меняет файлы
        }),
        show: vi.fn(),
        ...over,
    };
    return { host, state };
}

describe('отладочный снимок проекта', () => {
    it('ничего не меняется: ничего не пишется', async () => {
        const { host } = fakeHost();
        const { store } = memoryStore();
        const snapshotter = createSnapshotter(host, store);
        expect(await snapshotter.tick()).toBe(false);
        expect(host.pack).not.toHaveBeenCalled();
        expect(store.write).not.toHaveBeenCalled();
    });

    it('несохранённые правки или изменение файлов проекта: снимок записывается вместе с вкладками и временем', async () => {
        const { host, state } = fakeHost();
        const { store, current } = memoryStore();
        const snapshotter = createSnapshotter(host, store, () => 1234);
        state.dirty = true;
        expect(await snapshotter.tick()).toBe(true);
        expect(current()).toEqual({ bytes: state.bytes, tabs: ['a', 'b'], active: 'b', savedAt: 1234 });

        state.dirty = false;
        state.revision++; // сохранили или создали новый проект
        state.bytes = new Uint8Array([9]);
        expect(await snapshotter.tick()).toBe(true);
        expect(current()!.bytes).toEqual(new Uint8Array([9]));
    });

    it('тот же архив второй раз не пишется, а изменившийся пишется', async () => {
        const { host, state } = fakeHost();
        const { store } = memoryStore();
        const snapshotter = createSnapshotter(host, store);
        state.dirty = true;
        expect(await snapshotter.tick()).toBe(true);
        expect(await snapshotter.tick()).toBe(false);
        expect(store.write).toHaveBeenCalledTimes(1);
        state.bytes = new Uint8Array([1, 2, 4]); // та же длина, другой байт
        expect(await snapshotter.tick()).toBe(true);
        state.bytes = new Uint8Array([1, 2]); // другая длина
        expect(await snapshotter.tick()).toBe(true);
        expect(store.write).toHaveBeenCalledTimes(3);
    });

    it('смена проекта без правок (revision) тоже даёт снимок, а повтор нет', async () => {
        const { host, state } = fakeHost();
        const { store } = memoryStore();
        const snapshotter = createSnapshotter(host, store);
        state.revision = 5;
        expect(await snapshotter.tick()).toBe(true);
        expect(await snapshotter.tick()).toBe(false);
    });

    it('шаг, пока предыдущий не закончился, пропускается', async () => {
        let release!: () => void;
        const slow = new Promise<Uint8Array>((resolve) => (release = () => resolve(new Uint8Array([1]))));
        const { host, state } = fakeHost({ pack: vi.fn(() => slow) });
        const { store } = memoryStore();
        const snapshotter = createSnapshotter(host, store);
        state.dirty = true;
        const first = snapshotter.tick();
        expect(await snapshotter.tick()).toBe(false);
        release();
        expect(await first).toBe(true);
        expect(host.pack).toHaveBeenCalledOnce();
    });

    it('сбой упаковки или записи не бросает, и следующий шаг пробует снова', async () => {
        const pack = vi.fn().mockRejectedValueOnce(new Error('нет')).mockResolvedValue(new Uint8Array([1]));
        const { host, state } = fakeHost({ pack });
        const { store } = memoryStore();
        (store.write as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('квота'));
        const snapshotter = createSnapshotter(host, store);
        state.dirty = true;
        expect(await snapshotter.tick()).toBe(false);
        expect(await snapshotter.tick()).toBe(false); // запись не удалась
        expect(await snapshotter.tick()).toBe(true);
    });

    it('запуск: проект поднимается из снимка, вкладки открываются по порядку, активная последней; открытие не считается правкой', async () => {
        const snapshot: Snapshot = { bytes: new Uint8Array([7, 7]), tabs: ['a', 'b'], active: 'a', savedAt: 1 };
        const { host } = fakeHost();
        const { store } = memoryStore(snapshot);
        const snapshotter = createSnapshotter(host, store);
        expect(await snapshotter.restore()).toBe(true);
        expect(host.open).toHaveBeenCalledWith(snapshot.bytes);
        expect((host.show as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(['a', 'b', 'a']);
        expect(await snapshotter.tick()).toBe(false); // сразу после подъёма писать нечего
    });

    it('запуск без снимка или с негодным снимком: false, редактор не тронут', async () => {
        const a = fakeHost();
        expect(await createSnapshotter(a.host, memoryStore().store).restore()).toBe(false);
        expect(a.host.open).not.toHaveBeenCalled();

        const b = fakeHost({ open: vi.fn(async () => Promise.reject(new Error('битый'))) });
        const snapshot: Snapshot = { bytes: new Uint8Array([1]), tabs: [], active: null, savedAt: 0 };
        expect(await createSnapshotter(b.host, memoryStore(snapshot).store).restore()).toBe(false);

        const c = fakeHost();
        const broken: SnapshotStore = { read: async () => Promise.reject(new Error('нет базы')), write: async () => {}, clear: async () => {} };
        expect(await createSnapshotter(c.host, broken).restore()).toBe(false);
    });

    it('поднятый снимок без активной вкладки: активной не выводится', async () => {
        const { host } = fakeHost();
        const snapshot: Snapshot = { bytes: new Uint8Array([1]), tabs: ['a'], active: null, savedAt: 0 };
        await createSnapshotter(host, memoryStore(snapshot).store).restore();
        expect((host.show as ReturnType<typeof vi.fn>).mock.calls.map((c) => c[0])).toEqual(['a']);
    });

    it('clear стирает снимок', async () => {
        const { host } = fakeHost();
        const { store, current } = memoryStore({ bytes: new Uint8Array([1]), tabs: [], active: null, savedAt: 0 });
        await createSnapshotter(host, store).clear();
        expect(current()).toBeNull();
    });
});
