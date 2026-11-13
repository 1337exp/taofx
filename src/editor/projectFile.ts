// Граница между редактором и проектом. Редактор по-прежнему держит в памяти один документ (граф, система частиц, картинки
// как `data:` внутри графа); проект хранит то же самое иначе: картинки отдельными файлами-ассетами, документ ссылается на
// них по id. Здесь два перехода туда и обратно, без Vue и DOM (поэтому их можно проверять в тестах).

import type { Registry } from '@/graph/registry';
import type { LoadError } from '@/graph/serialize';
import type { Graph, SavedView } from '@/graph/types';
import { serializeParticles } from '@/particles/serialize';
import type { SystemDef } from '@/particles/types';
import { extname, join, pathProblem, stem, uniquePath } from '@/project/paths';
import type { Body } from '@/project/kinds';
import type { Project, Resource } from '@/project/project';
import { emptyDoc, parseDoc, withUsedTextures, type EditorDoc } from './doc';

/** Что редактор помнит о том, как открытый документ лежит в проекте. */
export interface ProjectLink {
    /** Id документа в проекте; null: документа ещё нет (новый проект, импортированный файл), при сохранении создастся. */
    docId: string | null;
    /** Какое имя текстуры графа какому ассету соответствует: так повторное сохранение не плодит копии и не теряет id. */
    textureAssets: Record<string, string>;
}

export const emptyLink = (): ProjectLink => ({ docId: null, textureAssets: {} });

export interface LoadedDoc {
    doc: EditorDoc;
    view?: SavedView;
    link: ProjectLink;
    /** Недопустимых связей отброшено при разборе графа. */
    dropped: number;
    /** Картинок, на которые документ ссылается, а ассета в проекте нет: из графа они убраны. */
    missingAssets: number;
}

export type LoadDocResult = { ok: true; loaded: LoadedDoc } | { ok: false; error: LoadError };

//--------------------------------------------------
// картинки: байты <-> data:-адрес

const MIME_BY_EXT: Record<string, string> = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
const EXT_BY_MIME: Record<string, string> = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };
const DATA_URI = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]*={0,2})$/;

export function toDataUri(bytes: Uint8Array, mime: string): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return `data:${mime};base64,${btoa(binary)}`;
}

/** Картинка из `data:`-адреса или null, если это не base64 PNG, JPEG, GIF или WebP (тогда адрес остаётся в графе как есть). */
export function fromDataUri(src: string): { ext: string; bytes: Uint8Array } | null {
    const m = DATA_URI.exec(src);
    if (!m) return null;
    const binary = atob(m[2]!);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { ext: EXT_BY_MIME[m[1]!]!, bytes };
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((v, i) => v === b[i]);

/** Имя файла из имени текстуры: без знаков, которых нет в именах на Windows. */
function fileStem(name: string): string {
    const cleaned = name.replace(/[<>:"|?*\\/\x00-\x1f\x7f]+/g, '_').trim().replace(/[. ]+$/, '').slice(0, 100);
    return cleaned === '' || pathProblem(cleaned) ? 'texture' : cleaned;
}

//--------------------------------------------------
// документы проекта

/** Имя файла документа из имени проекта: буквы и цифры через дефис; пустое или негодное (`con`) даёт `fallback`. */
function slugOf(hint: string, fallback: string): string {
    const slug = hint.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 100);
    return slug === '' || pathProblem(slug) ? fallback : slug;
}

const DIRS = { effect: 'effects', material: 'materials' } as const;
const SUFFIXES = { effect: '.fx.json', material: '.mat.json' } as const;
type DocKindName = keyof typeof DIRS;

const kindOfDoc = (doc: EditorDoc): DocKindName => (doc.system ? 'effect' : 'material');

/** Документ, который редактор открывает: первый эффект по пути, а нет эффектов, первый материал. */
function mainDocument(project: Project): Resource | undefined {
    const docs = project.resources.filter((r) => r.type === 'doc' && (r.kind === 'effect' || r.kind === 'material'));
    const byPath = (a: Resource, b: Resource) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    return docs.filter((r) => r.kind === 'effect').sort(byPath)[0] ?? docs.sort(byPath)[0];
}

/**
 * Поднимает документ из проекта в вид, в котором его держит редактор. Картинки-ассеты вставляются в граф как `data:`;
 * дальше документ разбирается тем же строгим разбором, что и файл рантайма. В проекте без эффекта и материала открывается
 * пустой документ (его сохранение создаст файл).
 */
export function loadProjectDoc(project: Project, registry: Registry): LoadDocResult {
    const resource = mainDocument(project);
    if (!resource) return { ok: true, loaded: { doc: emptyDoc(), link: emptyLink(), dropped: 0, missingAssets: 0 } };

    const body = project.readDoc(resource.id)!.body;
    const graph = JSON.parse(JSON.stringify(body.graph)) as Graph & { textures?: Record<string, { asset?: string; src?: string }> };
    const link: ProjectLink = { docId: resource.id, textureAssets: {} };
    let missingAssets = 0;

    for (const [name, texture] of Object.entries(graph.textures ?? {})) {
        if (texture.asset === undefined) continue; // внешний адрес: остаётся как есть
        const asset = project.find(texture.asset);
        const bytes = asset ? project.files.read(asset.path) : undefined;
        const mime = asset ? MIME_BY_EXT[extname(asset.path).toLowerCase()] : undefined;
        if (!asset || !bytes || !mime) {
            delete graph.textures![name];
            missingAssets++;
            continue;
        }
        graph.textures![name] = { src: toDataUri(bytes, mime) };
        link.textureAssets[name] = asset.id;
    }

    // Разбор файла рантайма проверяет и приводит граф и систему; для этого документ пока снова собирается в его текст.
    const view = body.view as SavedView | undefined;
    const text =
        resource.kind === 'effect'
            ? serializeParticles({ system: body.system as SystemDef, material: graph as Graph }, false, view)
            : JSON.stringify({ format: 'taofx', version: 1, view, graph });
    const parsed = parseDoc(text, registry);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return { ok: true, loaded: { doc: parsed.doc, view: parsed.view, link, dropped: parsed.dropped, missingAssets } };
}

/**
 * Записывает документ редактора в проект. Картинки из `data:` становятся ассетами (прежний ассет под тем же именем
 * текстуры сохраняет id, и файл переписывается, только если картинка другая); ассеты, которые больше никто не использует,
 * удаляются. Если документ сменил вид (материал стал эффектом), файл переезжает, id остаётся. Возвращает новую связь.
 */
export function saveProjectDoc(project: Project, doc: EditorDoc, view: SavedView | undefined, link: ProjectLink, nameHint = ''): ProjectLink {
    const graph = JSON.parse(JSON.stringify(withUsedTextures(doc.graph))) as { textures?: Record<string, { asset?: string; src?: string }> };
    const next: ProjectLink = { docId: link.docId, textureAssets: {} };

    for (const [name, texture] of Object.entries(graph.textures ?? {})) {
        const image = texture.src === undefined ? null : fromDataUri(texture.src);
        if (!image) continue; // внешний адрес или другой вид данных: проект его не трогает
        let asset = link.textureAssets[name] ? project.find(link.textureAssets[name]!) : undefined;
        if (asset && extname(asset.path).toLowerCase() !== image.ext) {
            project.remove(asset.id, { force: true }); // картинка сменила формат: файл с другим расширением, запись новая
            asset = undefined;
        }
        if (asset) {
            if (!sameBytes(project.files.read(asset.path)!, image.bytes)) project.files.write(asset.path, image.bytes);
        } else {
            const path = uniquePath(join('textures', fileStem(name) + image.ext), (p) => project.files.has(p) || project.files.has(p + '.meta.json'));
            asset = project.addAsset(path, image.bytes);
        }
        next.textureAssets[name] = asset.id;
        graph.textures![name] = { asset: asset.id };
    }

    const kind = kindOfDoc(doc);
    const body: Body = { ...(view ? { view: { x: view.x, y: view.y, z: view.z } } : {}), ...(doc.system ? { system: JSON.parse(JSON.stringify(doc.system)) } : {}), graph };
    const existing = link.docId ? project.find(link.docId) : undefined;

    if (existing && existing.kind === kind) {
        project.writeDoc(existing.id, body);
    } else {
        const slug = slugOf(nameHint, kind);
        let dir: string = DIRS[kind];
        let base = slug;
        if (existing) {
            // сменился вид: файл переезжает в папку нового вида (если лежал в стандартной), имя то же, id тот же
            const oldKind = existing.kind as DocKindName;
            base = stem(existing.path).replace(/\.(fx|mat)$/, '');
            dir = existing.path.startsWith(DIRS[oldKind] + '/') ? DIRS[kind] : existing.path.slice(0, Math.max(0, existing.path.lastIndexOf('/')));
            project.remove(existing.id, { force: true });
        }
        const path = uniquePath(join(dir, base + SUFFIXES[kind]), (p) => project.files.has(p));
        next.docId = project.addDoc(path, kind, body, existing ? { id: existing.id } : undefined).id;
    }

    // ассеты, на которые документ больше не ссылается
    for (const id of Object.values(link.textureAssets)) {
        if (!Object.values(next.textureAssets).includes(id) && project.find(id)) project.remove(id); // без force: пока на картинку ссылается другой документ, она остаётся
    }
    return next;
}
