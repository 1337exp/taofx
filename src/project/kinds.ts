// Виды ресурсов проекта. Ресурс это файл, у которого есть личность (`id`) и вид.
//   asset  двоичный файл (картинка) и рядом `<файл>.meta.json` с id, видом и настройками импорта;
//   doc    JSON-документ: в нём `format`, `version`, `id` и тело.
// Новый вид (материал, эффект, модель) это ещё одна запись в списке видов, остальной код не меняется.

import { isId } from './ids';

export type Body = Record<string, unknown>;

export interface AssetKind {
    type: 'asset';
    kind: string;
    /** Расширения файлов вида, без точки, в нижнем регистре. */
    extensions: readonly string[];
    /** Настройки импорта новой записи. */
    defaults(): Body;
}

export interface DocKind {
    type: 'doc';
    kind: string;
    /** Значение поля `format` в файле. */
    format: string;
    /** Текущая версия тела. Файл новее неизвестен нам и сохраняется как есть. */
    version: number;
    /** Тело нового документа. */
    create(): Body;
    /** Id ресурсов, на которые тело ссылается. Пустые и ещё не выбранные значения возвращать не обязательно: лишнее отфильтруется. */
    refs(body: Body): string[];
    /** Годится ли тело: строка с причиной или null. */
    check(body: Body): string | null;
}

export type ResourceKind = AssetKind | DocKind;

export const ASSET_FORMAT = 'taofx-asset';
export const ASSET_VERSION = 1;
export const META_SUFFIX = '.meta.json';

const isObj = (v: unknown): v is Body => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

//--------------------------------------------------

export const IMAGE: AssetKind = {
    type: 'asset',
    kind: 'image',
    extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
    defaults: () => ({}),
};

/** Прямоугольник кадра на картинке, в пикселях. */
export interface FrameRect {
    x: number;
    y: number;
    w: number;
    h: number;
}

/**
 * Флипбук: кадры анимации на картинке. Кадры задаются прямоугольниками, поэтому могут быть любой ширины (сетка частный случай).
 * Рантайму нужна равномерная сетка, и при сборке бандла флипбук запекается в лист с равными ячейками.
 */
export const FLIPBOOK: DocKind = {
    type: 'doc',
    kind: 'flipbook',
    format: 'taofx-flipbook',
    version: 1,
    create: () => ({ image: '', frames: [], fps: 12 }),
    refs: (body) => (isId(body.image) ? [body.image] : []),
    check(body) {
        if (typeof body.image !== 'string') return 'image';
        if (!isPositive(body.fps)) return 'fps';
        if (!Array.isArray(body.frames)) return 'frames';
        for (const [i, f] of body.frames.entries()) {
            if (!isObj(f) || !Number.isFinite(f.x) || !Number.isFinite(f.y) || !isPositive(f.w) || !isPositive(f.h)) return `frames.${i}`;
        }
        // необязательные настройки: как найдены кадры и какой фон запекается в альфу (тело читает `flipbook/model.ts`, здесь только форма)
        if (body.detect !== undefined && !checkDetect(body.detect)) return 'detect';
        if (body.key !== undefined && body.key !== null && !checkKey(body.key)) return 'key';
        return null;
    },
};

const isRgb = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((c) => Number.isInteger(c) && c >= 0 && c <= 255);
const isWhole = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 1;
function checkDetect(d: unknown): boolean {
    if (!isObj(d)) return false;
    if (d.mode === 'grid') return isWhole(d.cols) && isWhole(d.rows);
    return d.mode === 'auto' && isRgb(d.color) && isFiniteNumber(d.tolerance) && isFiniteNumber(d.gap) && isFiniteNumber(d.minSize);
}
const checkKey = (k: unknown): boolean => isObj(k) && isRgb(k.color) && isFiniteNumber(k.low) && isFiniteNumber(k.high);

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Вид камеры редактора в документе (необязателен). */
const checkView = (view: unknown): string | null => (view === undefined || (isObj(view) && isFiniteNumber(view.x) && isFiniteNumber(view.y) && isFiniteNumber(view.z)) ? null : 'view');

/**
 * Граф материала в теле документа: те же `nodes` и `connections`, что у рантайма, но картинки (`textures`) ссылаются на ассет
 * проекта по id (`{ asset }`), а не лежат внутри (`{ src }`: внешний адрес, который проект не трогает). Глубокую проверку
 * графа делает редактор при открытии (тем же разбором, что и файл рантайма), здесь только форма.
 */
function checkGraph(graph: unknown): string | null {
    if (!isObj(graph)) return 'graph';
    if (!isObj(graph.nodes)) return 'graph.nodes';
    if (!Array.isArray(graph.connections)) return 'graph.connections';
    if (graph.textures !== undefined) {
        if (!isObj(graph.textures)) return 'graph.textures';
        for (const [name, t] of Object.entries(graph.textures)) {
            if (!isObj(t) || (typeof t.asset !== 'string' && typeof t.src !== 'string')) return `graph.textures.${name}`;
        }
    }
    return null;
}

const graphRefs = (body: Body): string[] => {
    const textures = isObj(body.graph) ? body.graph.textures : undefined;
    return isObj(textures) ? Object.values(textures).flatMap((t) => (isObj(t) && isId(t.asset) ? [t.asset] : [])) : [];
};

/** Материал: граф нод, который строит вид поверхности, фильтра или частицы. Тело: `{ graph, view? }`. */
export const MATERIAL: DocKind = {
    type: 'doc',
    kind: 'material',
    format: 'taofx-material',
    version: 1,
    create: () => ({ graph: { nodes: {}, connections: [] } }),
    refs: graphRefs,
    check: (body) => checkGraph(body.graph) ?? checkView(body.view),
};

/**
 * Эффект: система частиц и материал частицы. Тело: `{ system, graph, view? }` (материал пока встроен; слои со ссылками на
 * документы-материалы придут позже и сменят версию с миграцией).
 */
export const EFFECT: DocKind = {
    type: 'doc',
    kind: 'effect',
    format: 'taofx-effect',
    version: 1,
    create: () => ({ system: {}, graph: { nodes: {}, connections: [] } }),
    refs: graphRefs,
    check: (body) => (isObj(body.system) ? null : 'system') ?? checkGraph(body.graph) ?? checkView(body.view),
};

export const DEFAULT_KINDS: readonly ResourceKind[] = [IMAGE, FLIPBOOK, MATERIAL, EFFECT];

//--------------------------------------------------

/** Реестр видов: поиск по расширению (ассеты), по формату (документы) и по имени вида. */
export interface Kinds {
    all(): readonly ResourceKind[];
    byName(kind: string): ResourceKind | undefined;
    byExtension(extension: string): AssetKind | undefined;
    byFormat(format: string): DocKind | undefined;
}

export function createKinds(list: readonly ResourceKind[] = DEFAULT_KINDS): Kinds {
    const names = new Map<string, ResourceKind>();
    const extensions = new Map<string, AssetKind>();
    const formats = new Map<string, DocKind>();
    for (const k of list) {
        if (names.has(k.kind)) throw new Error(`Вид «${k.kind}» уже есть`);
        names.set(k.kind, k);
        if (k.type === 'asset') for (const e of k.extensions) extensions.set(e, k);
        else formats.set(k.format, k);
    }
    return {
        all: () => list,
        byName: (kind) => names.get(kind),
        byExtension: (extension) => extensions.get(extension.replace(/^\./, '').toLowerCase()),
        byFormat: (format) => formats.get(format),
    };
}
