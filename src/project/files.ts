// Файлы проекта в памяти: байты по путям. Это то, что потом уходит в zip или на диск; здесь нет ни DOM, ни хранилища.
// Папок нет: они выводятся из путей (пустой папки не бывает, как и в zip).

import { assertPath, pathKey } from './paths';

export type FileChange = { kind: 'write' | 'delete'; path: string } | { kind: 'move'; path: string; from: string };

export type FileErrorCode = 'missing' | 'exists' | 'caseConflict' | 'fileInPath' | 'isFolder';

export class FileError extends Error {
    constructor(
        readonly code: FileErrorCode,
        readonly path: string,
    ) {
        super(`${code}: ${JSON.stringify(path)}`);
        this.name = 'FileError';
    }
}

export interface Files {
    /** Растёт на каждое изменение: по нему кэши понимают, что файлы другие, а проект, что он «не сохранён». */
    readonly revision: number;
    readonly size: number;
    has(path: string): boolean;
    /** Как путь записан в файлах (регистр может отличаться от `path`) или undefined. */
    find(path: string): string | undefined;
    /** Байты. Не копируются, менять их нельзя: чтобы изменить файл, запишите новый массив. */
    read(path: string): Uint8Array | undefined;
    text(path: string): string | undefined;
    /** Записывает файл (новый или поверх). Путь, отличающийся от записанного только регистром, ошибка `caseConflict`. */
    write(path: string, data: Uint8Array | string): void;
    delete(path: string): boolean;
    /** Переносит файл. Занятый путь `exists`; смена одного лишь регистра разрешена. */
    move(from: string, to: string): void;
    /** Пути по возрастанию; `prefix` это папка (`assets` или `assets/`): только то, что в ней. */
    paths(prefix?: string): string[];
    subscribe(listener: (change: FileChange) => void): () => void;
}

interface Entry {
    path: string;
    data: Uint8Array;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function createFiles(initial: Iterable<readonly [string, Uint8Array | string]> = []): Files {
    const map = new Map<string, Entry>();
    const listeners = new Set<(change: FileChange) => void>();
    let revision = 0;

    const bytesOf = (data: Uint8Array | string) => (typeof data === 'string' ? encoder.encode(data) : data);
    const emit = (change: FileChange) => {
        revision++;
        for (const listener of [...listeners]) listener(change);
    };

    /** Файл не может стоять там, где уже есть папка с этим именем, и внутри файла. `except`: переносимый файл не мешает сам себе. */
    function checkTree(path: string, key: string, except?: string) {
        for (const other of map.keys()) {
            if (other === except) continue;
            if (key.startsWith(other + '/')) throw new FileError('fileInPath', path);
            if (other.startsWith(key + '/')) throw new FileError('isFolder', path);
        }
    }

    for (const [path, data] of initial) {
        assertPath(path);
        const key = pathKey(path);
        if (map.has(key)) throw new FileError(map.get(key)!.path === path ? 'exists' : 'caseConflict', path);
        checkTree(path, key);
        map.set(key, { path, data: bytesOf(data) });
    }

    return {
        get revision() {
            return revision;
        },
        get size() {
            return map.size;
        },
        has: (path) => map.has(pathKey(path)),
        find: (path) => map.get(pathKey(path))?.path,
        read: (path) => map.get(pathKey(path))?.data,
        text(path) {
            const data = map.get(pathKey(path))?.data;
            return data === undefined ? undefined : decoder.decode(data);
        },
        write(path, data) {
            assertPath(path);
            const key = pathKey(path);
            const existing = map.get(key);
            if (existing && existing.path !== path) throw new FileError('caseConflict', path);
            if (!existing) checkTree(path, key);
            map.set(key, { path, data: bytesOf(data) });
            emit({ kind: 'write', path });
        },
        delete(path) {
            const key = pathKey(path);
            const existing = map.get(key);
            if (!existing) return false;
            map.delete(key);
            emit({ kind: 'delete', path: existing.path });
            return true;
        },
        move(from, to) {
            assertPath(to);
            const fromKey = pathKey(from);
            const entry = map.get(fromKey);
            if (!entry) throw new FileError('missing', from);
            if (entry.path === to) return;
            const toKey = pathKey(to);
            if (toKey !== fromKey) {
                if (map.has(toKey)) throw new FileError('exists', to);
                checkTree(to, toKey, fromKey);
            }
            map.delete(fromKey);
            map.set(toKey, { path: to, data: entry.data });
            emit({ kind: 'move', path: to, from: entry.path });
        },
        paths(prefix) {
            const folder = prefix === undefined ? undefined : pathKey(prefix.replace(/\/+$/, '')) + '/';
            return [...map.entries()]
                .filter(([key]) => folder === undefined || key.startsWith(folder))
                .map(([, entry]) => entry.path)
                .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
