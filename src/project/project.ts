// Проект: файлы в памяти плюс знание о том, какие из них ресурсы (у кого есть id и вид), кто на кого ссылается,
// и признак «не сохранено». Ничего не знает про zip, диск и браузер: записью занимается тот, кто берёт `snapshot()`.

import { createFiles, type Files } from './files';
import { isId, newId } from './ids';
import { ASSET_FORMAT, ASSET_VERSION, createKinds, DEFAULT_KINDS, META_SUFFIX, type AssetKind, type Body, type DocKind, type Kinds, type ResourceKind } from './kinds';
import { createManifest, parseManifest, PROJECT_FILE, serializeManifest, type Manifest, type ManifestError, type ProjectSettings } from './manifest';
import { extname, pathKey } from './paths';

/** Папка состояния редактора (вкладки, камера): живёт в проекте, но в обмен (`snapshot()` по умолчанию) не идёт. */
export const EDITOR_DIR = '.editor';

const isEditorPath = (path: string) => pathKey(path).startsWith(EDITOR_DIR + '/');
const isMetaPath = (path: string) => path.toLowerCase().endsWith(META_SUFFIX);

export interface Resource {
    id: string;
    /** Имя вида (`image`, `flipbook`…). */
    kind: string;
    type: 'asset' | 'doc';
    /** Путь самого файла (у ассета это картинка, у документа JSON). */
    path: string;
    /** Путь `.meta.json` ассета. */
    metaPath?: string;
    /** Id, на которые ссылается документ (может включать несуществующие: см. `dangling`). */
    refs: readonly string[];
}

export type ProblemCode = 'badJson' | 'badDoc' | 'badMeta' | 'duplicateId' | 'missingMeta' | 'orphanMeta' | 'unknownFormat';

/** Что не так с файлом. Проблемный файл не пропадает: он остаётся в проекте и пишется как есть, но ресурсом не считается. */
export interface Problem {
    code: ProblemCode;
    path: string;
    detail?: string;
}

export interface Scan {
    resources: Resource[];
    problems: Problem[];
}

const isObj = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);

function parseJson(text: string | undefined): unknown {
    try {
        return text === undefined ? undefined : JSON.parse(text);
    } catch {
        return undefined;
    }
}

/** Читает `.meta.json`: настройки или причина отказа строкой. */
function readMeta(text: string): { id: string; kind: string; import: Body } | string {
    const raw = parseJson(text);
    if (!isObj(raw) || raw.format !== ASSET_FORMAT) return 'format';
    if (typeof raw.version !== 'number' || raw.version > ASSET_VERSION) return 'version';
    if (!isId(raw.id)) return 'id';
    if (typeof raw.kind !== 'string') return 'kind';
    if (raw.import !== undefined && !isObj(raw.import)) return 'import';
    return { id: raw.id, kind: raw.kind, import: (raw.import as Body | undefined) ?? {} };
}

/** Перебирает файлы и находит ресурсы и проблемы. Чистая функция от файлов: порядок по путям, при повторе id первый побеждает. */
export function scanFiles(files: Files, kinds: Kinds): Scan {
    const resources: Resource[] = [];
    const problems: Problem[] = [];
    const ids = new Set<string>();
    const add = (resource: Resource, problemPath: string) => {
        if (ids.has(resource.id)) problems.push({ code: 'duplicateId', path: problemPath, detail: resource.id });
        else {
            ids.add(resource.id);
            resources.push(resource);
        }
    };

    for (const path of files.paths()) {
        if (path === PROJECT_FILE || isEditorPath(path)) continue;

        if (isMetaPath(path)) {
            if (!files.has(path.slice(0, -META_SUFFIX.length))) problems.push({ code: 'orphanMeta', path });
            continue;
        }

        const ext = extname(path).toLowerCase();
        const asset = kinds.byExtension(ext);
        if (asset) {
            const metaText = files.text(path + META_SUFFIX);
            if (metaText === undefined) {
                problems.push({ code: 'missingMeta', path });
                continue;
            }
            const metaPath = files.find(path + META_SUFFIX)!;
            const meta = readMeta(metaText);
            if (typeof meta === 'string') problems.push({ code: 'badMeta', path: metaPath, detail: meta });
            else if (meta.kind !== asset.kind) problems.push({ code: 'badMeta', path: metaPath, detail: 'kind' });
            else add({ id: meta.id, kind: meta.kind, type: 'asset', path, metaPath, refs: [] }, metaPath);
            continue;
        }

        if (ext !== '.json') continue;
        const raw = parseJson(files.text(path));
        if (raw === undefined) {
            problems.push({ code: 'badJson', path });
            continue;
        }
        if (!isObj(raw) || typeof raw.format !== 'string') continue; // чужой JSON: не наше дело

        const kind = kinds.byFormat(raw.format);
        if (!kind) {
            // файл будущей версии или формата рантайма (`taofx-particles`): остаётся как есть
            if (raw.format.startsWith('taofx-')) problems.push({ code: 'unknownFormat', path, detail: raw.format });
            continue;
        }
        if (typeof raw.version !== 'number' || raw.version > kind.version) {
            problems.push({ code: 'unknownFormat', path, detail: `${raw.format}@${String(raw.version)}` });
            continue;
        }
        const { format: _format, version: _version, id, ...body } = raw;
        if (!isId(id)) {
            problems.push({ code: 'badDoc', path, detail: 'id' });
            continue;
        }
        const bad = kind.check(body);
        if (bad) {
            problems.push({ code: 'badDoc', path, detail: bad });
            continue;
        }
        add({ id, kind: kind.kind, type: 'doc', path, refs: kind.refs(body).filter(isId) }, path);
    }
    return { resources, problems };
}

//--------------------------------------------------

export type ProjectErrorCode = 'missing' | 'pathTaken' | 'wrongExtension' | 'unknownKind' | 'invalidDoc' | 'badId';

export class ProjectError extends Error {
    constructor(
        readonly code: ProjectErrorCode,
        readonly detail: string,
    ) {
        super(`${code}: ${detail}`);
        this.name = 'ProjectError';
    }
}

export type RemoveResult = { ok: true; dangling: Resource[] } | { ok: false; referrers: Resource[] };

export interface Dangling {
    from: Resource;
    /** Id, которого в проекте нет. */
    ref: string;
}

export interface SnapshotOptions {
    /** Включить `.editor/`. По умолчанию нет: вкладки и камера в обмен не идут. */
    editor?: boolean;
}

export interface Project {
    readonly files: Files;
    readonly kinds: Kinds;
    readonly manifest: Manifest;
    setManifest(patch: { name?: string; settings?: Partial<ProjectSettings> }): void;

    readonly resources: readonly Resource[];
    readonly problems: readonly Problem[];
    find(id: string): Resource | undefined;
    byPath(path: string): Resource | undefined;

    /** Кладёт картинку (или другой ассет по расширению) и заводит ей запись с новым id. */
    addAsset(path: string, data: Uint8Array): Resource;
    /** Заводит записи файлам, которые положили без `.meta.json` (например, распаковали zip, собранный руками). Сколько заведено. */
    adopt(): number;
    /** Новый документ. `id` задают, когда документ переезжает из другого вида (id сохраняется); по умолчанию создаётся новый. */
    addDoc(path: string, kind: string, body?: Body, options?: { id?: string }): Resource;
    readDoc(id: string): { resource: Resource; body: Body } | undefined;
    /** Заменяет тело документа, id и формат остаются. Негодное тело: `ProjectError('invalidDoc')`. */
    writeDoc(id: string, body: Body): void;
    importSettings(id: string): Body | undefined;
    setImportSettings(id: string, settings: Body): void;

    /** Переносит ресурс (и `.meta.json` ассета рядом). Id не меняется, ссылки целы. */
    move(id: string, to: string): void;
    /** Удаляет. Если на ресурс ссылаются, без `force` ничего не делает и называет ссылающихся. */
    remove(id: string, options?: { force?: boolean }): RemoveResult;
    referrers(id: string): Resource[];
    dangling(): Dangling[];

    /** Есть изменения после открытия или последнего `markSaved()`. */
    readonly dirty: boolean;
    markSaved(): void;
    /** Файлы для записи, `project.json` первым. Тот, кто записал их успешно, зовёт `markSaved()`. */
    snapshot(options?: SnapshotOptions): { path: string; data: Uint8Array }[];
}

export interface CreateOptions {
    name?: string;
    kinds?: readonly ResourceKind[];
}

export function createProject(options: CreateOptions = {}): Project {
    const files = createFiles();
    files.write(PROJECT_FILE, serializeManifest(createManifest(options.name ?? '')));
    return build(files, createManifest(options.name ?? ''), createKinds(options.kinds ?? DEFAULT_KINDS));
}

export type OpenResult = { ok: true; project: Project } | { ok: false; error: ManifestError | 'noManifest' };

/** Открывает проект из файлов (распакованный zip, папка). Нужен `project.json`; остальное сканируется, проблемы в `project.problems`. */
export function openProject(files: Files, kinds: readonly ResourceKind[] = DEFAULT_KINDS): OpenResult {
    const text = files.text(PROJECT_FILE);
    if (text === undefined) return { ok: false, error: 'noManifest' };
    const parsed = parseManifest(text);
    if (!parsed.ok) return parsed;
    return { ok: true, project: build(files, parsed.manifest, createKinds(kinds)) };
}

function build(files: Files, initial: Manifest, kinds: Kinds): Project {
    let manifest = initial;
    let savedRevision = files.revision;
    let cache: { revision: number; scan: Scan; byId: Map<string, Resource> } | undefined;

    const current = () => {
        if (!cache || cache.revision !== files.revision) {
            const scan = scanFiles(files, kinds);
            cache = { revision: files.revision, scan, byId: new Map(scan.resources.map((r) => [r.id, r])) };
        }
        return cache;
    };

    const kindOf = (resource: Resource) => kinds.byName(resource.kind)!;
    const need = (id: string) => {
        const resource = current().byId.get(id);
        if (!resource) throw new ProjectError('missing', id);
        return resource;
    };

    /** Пишет `.meta.json` ассета с новым id и возвращает ресурс (по записанным файлам). */
    function writeMeta(path: string, kind: AssetKind, taken: (id: string) => boolean): Resource {
        const id = newId(taken);
        const metaPath = path + META_SUFFIX;
        files.write(metaPath, JSON.stringify({ format: ASSET_FORMAT, version: ASSET_VERSION, id, kind: kind.kind, import: kind.defaults() }, null, 2) + '\n');
        return { id, kind: kind.kind, type: 'asset', path: files.find(path)!, metaPath: files.find(metaPath)!, refs: [] };
    }

    const docText = (kind: DocKind, id: string, body: Body) => {
        const { format: _f, version: _v, id: _i, ...rest } = body;
        // ключи тела по алфавиту: один и тот же документ даёт один и тот же текст, откуда бы ни собрали тело (иначе «без изменений» не узнать)
        const sorted = Object.fromEntries(Object.entries(rest).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
        return JSON.stringify({ format: kind.format, version: kind.version, id, ...sorted }, null, 2) + '\n';
    };

    const project: Project = {
        files,
        kinds,
        get manifest() {
            return manifest;
        },
        setManifest(patch) {
            const next = createManifest(patch.name ?? manifest.name);
            next.settings = { ...manifest.settings, ...patch.settings };
            manifest = next;
            files.write(PROJECT_FILE, serializeManifest(manifest));
        },

        get resources() {
            return current().scan.resources;
        },
        get problems() {
            return current().scan.problems;
        },
        find: (id) => current().byId.get(id),
        byPath(path) {
            const key = pathKey(path);
            return current().scan.resources.find((r) => pathKey(r.path) === key);
        },

        addAsset(path, data) {
            const kind = kinds.byExtension(extname(path));
            if (!kind || isMetaPath(path)) throw new ProjectError('wrongExtension', path);
            if (files.has(path) || pathKey(path) === PROJECT_FILE) throw new ProjectError('pathTaken', path);
            if (files.has(path + META_SUFFIX)) throw new ProjectError('pathTaken', path + META_SUFFIX);
            files.write(path, data);
            try {
                return writeMeta(path, kind, (id) => current().byId.has(id));
            } catch (error) {
                files.delete(path); // не оставляем ассет без записи, если запись не удалась (например, слишком длинный путь)
                throw error;
            }
        },
        adopt() {
            const used = new Set(current().byId.keys());
            let count = 0;
            for (const problem of current().scan.problems.filter((p) => p.code === 'missingMeta')) {
                const kind = kinds.byExtension(extname(problem.path))!;
                used.add(writeMeta(problem.path, kind, (id) => used.has(id)).id);
                count++;
            }
            return count;
        },
        addDoc(path, kindName, body, options = {}) {
            const kind = kinds.byName(kindName);
            if (!kind || kind.type !== 'doc') throw new ProjectError('unknownKind', kindName);
            if (extname(path).toLowerCase() !== '.json' || isMetaPath(path) || pathKey(path) === PROJECT_FILE) throw new ProjectError('wrongExtension', path);
            if (files.has(path)) throw new ProjectError('pathTaken', path);
            const content = { ...kind.create(), ...body };
            const bad = kind.check(content);
            if (bad) throw new ProjectError('invalidDoc', bad);
            if (options.id !== undefined && (!isId(options.id) || current().byId.has(options.id))) throw new ProjectError('badId', options.id);
            const id = options.id ?? newId((candidate) => current().byId.has(candidate));
            files.write(path, docText(kind, id, content));
            return { id, kind: kind.kind, type: 'doc', path: files.find(path)!, refs: kind.refs(content).filter(isId) };
        },
        readDoc(id) {
            const resource = current().byId.get(id);
            if (!resource || resource.type !== 'doc') return undefined;
            const { format: _f, version: _v, id: _i, ...body } = parseJson(files.text(resource.path)) as Body;
            return { resource, body };
        },
        writeDoc(id, body) {
            const resource = need(id);
            const kind = kindOf(resource);
            if (kind.type !== 'doc') throw new ProjectError('unknownKind', resource.kind);
            const bad = kind.check(body);
            if (bad) throw new ProjectError('invalidDoc', bad);
            const text = docText(kind, id, body);
            if (files.text(resource.path) !== text) files.write(resource.path, text); // тот же текст не пишем: «не сохранено» не от пустого
        },
        importSettings(id) {
            const resource = current().byId.get(id);
            if (!resource?.metaPath) return undefined;
            const meta = readMeta(files.text(resource.metaPath)!);
            return typeof meta === 'string' ? undefined : meta.import;
        },
        setImportSettings(id, settings) {
            const resource = need(id);
            if (!resource.metaPath) throw new ProjectError('unknownKind', resource.kind);
            files.write(resource.metaPath, JSON.stringify({ format: ASSET_FORMAT, version: ASSET_VERSION, id, kind: resource.kind, import: settings }, null, 2) + '\n');
        },

        move(id, to) {
            const resource = need(id);
            const sameKind = resource.type === 'asset' ? kinds.byExtension(extname(to))?.kind === resource.kind : extname(to).toLowerCase() === '.json';
            if (!sameKind || isMetaPath(to)) throw new ProjectError('wrongExtension', to);
            if (pathKey(to) === PROJECT_FILE) throw new ProjectError('pathTaken', to);
            const sameFile = (a: string, b: string) => pathKey(a) === pathKey(b);
            if (files.has(to) && !sameFile(to, resource.path)) throw new ProjectError('pathTaken', to);
            if (resource.metaPath) {
                const metaTo = to + META_SUFFIX;
                if (files.has(metaTo) && !sameFile(metaTo, resource.metaPath)) throw new ProjectError('pathTaken', metaTo);
            }
            files.move(resource.path, to);
            if (resource.metaPath) {
                try {
                    files.move(resource.metaPath, to + META_SUFFIX);
                } catch (error) {
                    files.move(to, resource.path); // не разлучаем ассет с его записью
                    throw error;
                }
            }
        },
        remove(id, options = {}) {
            const resource = need(id);
            const referrers = project.referrers(id);
            if (referrers.length > 0 && !options.force) return { ok: false, referrers };
            files.delete(resource.path);
            if (resource.metaPath) files.delete(resource.metaPath);
            return { ok: true, dangling: referrers };
        },
        referrers: (id) => current().scan.resources.filter((r) => r.refs.includes(id)),
        dangling() {
            const { scan, byId } = current();
            return scan.resources.flatMap((from) => from.refs.filter((ref) => !byId.has(ref)).map((ref) => ({ from, ref })));
        },

        get dirty() {
            return files.revision !== savedRevision;
        },
        markSaved() {
            savedRevision = files.revision;
        },
        snapshot(options = {}) {
            const paths = files.paths().filter((p) => options.editor || !isEditorPath(p));
            paths.sort((a, b) => Number(b === PROJECT_FILE) - Number(a === PROJECT_FILE));
            return paths.map((path) => ({ path, data: files.read(path)! }));
        },
    };
    return project;
}
