// Пути внутри проекта. Проект это набор файлов по путям, как в zip: POSIX-стиль, без `..`, без обратной косой.
// Правила взяты так, чтобы проект без поломок переезжал между Windows, macOS и Linux и между zip и папкой.

export const MAX_PATH = 512;
export const MAX_SEGMENT = 128;

export type PathProblem =
    | 'empty'
    | 'tooLong'
    | 'absolute'
    | 'backslash'
    | 'control'
    | 'emptySegment'
    | 'dots'
    | 'segmentTooLong'
    | 'badChar'
    | 'trailing'
    | 'reserved';

/** Символы, которых нет в именах на Windows (там проект тоже должен открываться). */
const BAD_CHARS = /[<>:"|?*]/;
/** Имена устройств Windows: запрещены и с расширением (`con.txt`). */
const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

/** Почему путь не годится, или null, если годится. Путь относительный, части через `/`. */
export function pathProblem(path: string): PathProblem | null {
    if (path === '') return 'empty';
    if (path.length > MAX_PATH) return 'tooLong';
    if (path.startsWith('/')) return 'absolute';
    if (path.includes('\\')) return 'backslash';
    if (/[\x00-\x1f\x7f]/.test(path)) return 'control';
    for (const part of path.split('/')) {
        if (part === '') return 'emptySegment';
        if (part === '.' || part === '..') return 'dots';
        if (part.length > MAX_SEGMENT) return 'segmentTooLong';
        if (BAD_CHARS.test(part)) return 'badChar';
        if (part.endsWith(' ') || part.endsWith('.')) return 'trailing';
        if (RESERVED.test(part.split('.')[0]!)) return 'reserved';
    }
    return null;
}

export class PathError extends Error {
    constructor(
        readonly path: string,
        readonly problem: PathProblem,
    ) {
        super(`Недопустимый путь ${JSON.stringify(path)}: ${problem}`);
        this.name = 'PathError';
    }
}

/** Возвращает путь, если он годится; иначе бросает `PathError`. */
export function assertPath(path: string): string {
    const problem = pathProblem(path);
    if (problem) throw new PathError(path, problem);
    return path;
}

/**
 * Ключ для сравнения путей: без учёта регистра и в нормальной форме Юникода. Два пути с одним ключом это один файл
 * (на Windows и macOS файловая система так и считает, поэтому проект не должен хранить `A.png` и `a.png` рядом).
 */
export const pathKey = (path: string): string => path.normalize('NFC').toLowerCase();

/** Папка пути: `a/b/c.png` → `a/b`; у файла в корне пустая строка. */
export function dirname(path: string): string {
    const i = path.lastIndexOf('/');
    return i < 0 ? '' : path.slice(0, i);
}

export const basename = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

/** Расширение с точкой (`.png`) или пустая строка; у `.gitignore` расширения нет. */
export function extname(path: string): string {
    const name = basename(path);
    const i = name.lastIndexOf('.');
    return i > 0 ? name.slice(i) : '';
}

/** Имя файла без последнего расширения. */
export const stem = (path: string): string => {
    const name = basename(path);
    return name.slice(0, name.length - extname(name).length);
};

export const join = (...parts: string[]): string => parts.filter((p) => p !== '').join('/');

/** Свободный путь: сам `path`, а если занят, то `имя 2.расширение`, `имя 3.расширение`… (`taken` сравнивает по своим правилам). */
export function uniquePath(path: string, taken: (path: string) => boolean): string {
    if (!taken(path)) return path;
    const dir = dirname(path);
    const name = stem(path);
    const ext = extname(path);
    for (let n = 2; ; n++) {
        const candidate = join(dir, `${name} ${n}${ext}`);
        if (!taken(candidate)) return candidate;
    }
}
