// Отладочный снимок проекта. Только для разработки (в сборке не участвует): проект живёт в памяти вкладки, и каждая перезагрузка
// страницы (правка кода, перезапуск сервера) его сбрасывает. Пока вкладка жива, проект раз в пару секунд упаковывается в
// архив `.taofx` и кладётся в IndexedDB; при запуске, если снимок есть, проект поднимается из него вместе с открытыми вкладками.
// `?fresh` в адресе запускает с чистого листа и стирает снимок.

export interface Snapshot {
    bytes: Uint8Array;
    /** Id открытых вкладок по порядку и та, что была на экране. */
    tabs: string[];
    active: string | null;
    savedAt: number;
}

export interface SnapshotStore {
    read(): Promise<Snapshot | null>;
    write(snapshot: Snapshot): Promise<void>;
    clear(): Promise<void>;
}

/** Что снимку нужно от редактора. */
export interface SnapshotHost {
    /** Есть несохранённые правки. */
    dirty(): boolean;
    /** Растёт, когда меняются файлы проекта (сохранение, открытие, новый проект). */
    revision(): number;
    /** Архив проекта в его нынешнем виде (открытый документ предварительно записывается в проект). */
    pack(): Promise<Uint8Array>;
    tabs(): string[];
    active(): string | null;
    /** Открывает архив как проект. */
    open(bytes: Uint8Array): Promise<void>;
    /** Выводит вкладку на экран (она добавляется, если её ещё нет). */
    show(id: string): void;
}

const same = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

export function createSnapshotter(host: SnapshotHost, store: SnapshotStore, now: () => number = Date.now) {
    let lastRevision = host.revision();
    let lastBytes: Uint8Array | null = null;
    let busy = false;

    /** Поднимает проект из снимка. false: снимка нет или он не открылся. */
    async function restore(): Promise<boolean> {
        let snapshot: Snapshot | null = null;
        try {
            snapshot = await store.read();
            if (!snapshot) return false;
            await host.open(snapshot.bytes);
            for (const id of snapshot.tabs) host.show(id);
            if (snapshot.active) host.show(snapshot.active);
        } catch {
            return false;
        }
        lastBytes = snapshot.bytes;
        lastRevision = host.revision();
        return true;
    }

    /** Один шаг: если что-то изменилось, записывает снимок. true: записан. */
    async function tick(): Promise<boolean> {
        if (busy) return false;
        if (!host.dirty() && host.revision() === lastRevision) return false;
        busy = true;
        try {
            const bytes = await host.pack();
            lastRevision = host.revision();
            if (lastBytes && same(bytes, lastBytes)) return false;
            await store.write({ bytes, tabs: host.tabs(), active: host.active(), savedAt: now() });
            lastBytes = bytes;
            return true;
        } catch {
            return false;
        } finally {
            busy = false;
        }
    }

    return { restore, tick, clear: () => store.clear() };
}

//--------------------------------------------------

const DB = 'taofx-debug';
const STORE = 'snapshot';
const KEY = 'project';

function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function run<T>(mode: IDBTransactionMode, make: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await openDb();
    try {
        return await new Promise<T>((resolve, reject) => {
            const request = make(db.transaction(STORE, mode).objectStore(STORE));
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    } finally {
        db.close();
    }
}

export const indexedDbStore: SnapshotStore = {
    read: async () => ((await run('readonly', (s) => s.get(KEY))) as Snapshot | undefined) ?? null,
    write: async (snapshot) => void (await run('readwrite', (s) => s.put(snapshot, KEY))),
    clear: async () => void (await run('readwrite', (s) => s.delete(KEY))),
};

/**
 * Запускает отладочный снимок: поднимает проект из снимка (если не `?fresh`) и дальше пишет его раз в `intervalMs`.
 * Возвращает остановку.
 */
export async function startDebugSnapshot(host: SnapshotHost, intervalMs = 2000): Promise<() => void> {
    const snapshotter = createSnapshotter(host, indexedDbStore);
    if (new URLSearchParams(location.search).has('fresh')) await snapshotter.clear().catch(() => {});
    else if (await snapshotter.restore()) console.info('[taofx] проект поднят из отладочного снимка (?fresh начинает с чистого листа)');
    const timer = setInterval(() => void snapshotter.tick(), intervalMs);
    return () => clearInterval(timer);
}
