// Проект в одном файле: zip с расширением `.taofx` (как docx). Внутри `project.json` и файлы проекта по путям.
// Запись и чтение zip делает @1337exp/taoux/zip; здесь то, что знает про проект: что считать проектом и какие ошибки показывать.

import { createZip, readZip, ZipError, type ZipErrorCode, type ZipReadLimits } from '@1337exp/taoux/zip';
import { createFiles, FileError } from './files';
import { DEFAULT_KINDS, type ResourceKind } from './kinds';
import type { ManifestError } from './manifest';
import { PathError } from './paths';
import { openProject, type Project, type SnapshotOptions } from './project';

export const PROJECT_EXTENSION = '.taofx';
export const PROJECT_MIME = 'application/zip';

export interface PackOptions extends SnapshotOptions {
    /** Время изменения у файлов в архиве. По умолчанию сейчас. */
    date?: Date;
}

/** Собирает файл проекта. Тот, кто записал его успешно, зовёт `project.markSaved()`. */
export function packProject(project: Project, options: PackOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
    return createZip(
        project.snapshot(options).map((f) => ({ name: f.path, data: f.data })),
        { date: options.date },
    );
}

/** Почему проект не открылся. `badPath`: в архиве путь, который проект не принимает (`con.txt`, `A.png` рядом с `a.png`). */
export type UnpackErrorCode = ZipErrorCode | ManifestError | 'noManifest' | 'badPath';

export type UnpackResult = { ok: true; project: Project } | { ok: false; error: UnpackErrorCode; detail?: string };

export interface UnpackOptions {
    kinds?: readonly ResourceKind[];
    limits?: ZipReadLimits;
}

/**
 * Если вся папка проекта упакована одной внешней папкой (`мой-проект/project.json`, так делает «Сжать» в проводнике),
 * общая папка снимается. Служебное `__MACOSX/` не мешает.
 */
function stripWrapper(entries: { name: string; data: Uint8Array }[]): { name: string; data: Uint8Array }[] {
    const real = entries.filter((e) => !e.name.startsWith('__MACOSX/'));
    const wrapper = real.find((e) => /^[^/]+\/project\.json$/.test(e.name))?.name.split('/')[0];
    if (wrapper === undefined || !real.every((e) => e.name.startsWith(wrapper + '/'))) return real;
    return real.map((e) => ({ name: e.name.slice(wrapper.length + 1), data: e.data }));
}

/** Открывает файл проекта. Не бросает: причина отказа это результат (текст для пользователя собирает интерфейс по коду). */
export async function unpackProject(bytes: Uint8Array, options: UnpackOptions = {}): Promise<UnpackResult> {
    let entries;
    try {
        entries = stripWrapper(await readZip(bytes, options.limits));
    } catch (error) {
        if (error instanceof ZipError) return { ok: false, error: error.code, detail: error.detail };
        throw error;
    }

    let files;
    try {
        files = createFiles(entries.map((e) => [e.name, e.data] as const));
    } catch (error) {
        if (error instanceof PathError || error instanceof FileError) return { ok: false, error: 'badPath', detail: error.path };
        throw error;
    }

    const opened = openProject(files, options.kinds ?? DEFAULT_KINDS);
    return opened.ok ? opened : { ok: false, error: opened.error };
}
