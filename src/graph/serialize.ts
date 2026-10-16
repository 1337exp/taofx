import { canConnect, createGraph } from './ops';
import type { Registry } from './registry';
import type { Connection, Constant, Graph, NodeInstance, SavedView } from './types';

/** Имя формата в файле: по нему отличаем наш файл от любого другого JSON. */
export const FORMAT = 'taofx';
/** Версия схемы. При несовместимых изменениях увеличиваем и добавляем миграцию в `migrate`. */
export const VERSION = 1;

export type LoadErrorCode = 'invalidJson' | 'notTaofxFile' | 'newerVersion' | 'invalidStructure' | 'unknownNode';

/** Причина отказа; текст для пользователя собирает UI по `code` (в `detail` то, что подставить в сообщение). */
export interface LoadError {
    code: LoadErrorCode;
    detail?: string;
}

export type ParseResult =
    | { ok: true; graph: Graph; view?: SavedView; droppedConnections: number }
    | { ok: false; error: LoadError };

export function serialize(graph: Graph, view?: SavedView, pretty = true): string {
    return JSON.stringify({ format: FORMAT, version: VERSION, view, graph }, null, pretty ? 2 : undefined);
}

//--------------------------------------------------
// Разбор: файл приходит извне, поэтому ничему не доверяем.

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Ключи, которыми можно подменить прототип объекта, если использовать их как id. */
const FORBIDDEN_IDS = new Set(['__proto__', 'constructor', 'prototype']);

class Invalid extends Error {
    constructor(readonly error: LoadError) {
        super(error.code);
    }
}

const bad = (detail: string): never => {
    throw new Invalid({ code: 'invalidStructure', detail });
};

/** Приведение старых версий схемы к текущей. Сейчас версия одна, так что просто возвращаем как есть. */
function migrate(file: Obj, _version: number): Obj {
    return file;
}

function parseValue(path: string, raw: unknown): Constant {
    if (isNum(raw)) return raw;
    if (Array.isArray(raw) && raw.length >= 1 && raw.length <= 4 && raw.every(isNum)) return [...raw];
    return bad(path);
}

function parseNode(key: string, raw: unknown): NodeInstance {
    if (!isObj(raw)) return bad(`nodes.${key}`);
    if (!isStr(raw.id) || raw.id !== key || FORBIDDEN_IDS.has(raw.id)) return bad(`nodes.${key}.id`);
    if (!isStr(raw.type)) return bad(`nodes.${key}.type`);
    if (!isNum(raw.x) || !isNum(raw.y)) return bad(`nodes.${key}.x/y`);
    if (raw.values !== undefined && !isObj(raw.values)) return bad(`nodes.${key}.values`);

    const values: Record<string, Constant> = {};
    for (const [name, value] of Object.entries((raw.values as Obj | undefined) ?? {})) {
        if (FORBIDDEN_IDS.has(name)) return bad(`nodes.${key}.values.${name}`);
        values[name] = parseValue(`nodes.${key}.values.${name}`, value);
    }
    return { id: raw.id, type: raw.type, x: raw.x, y: raw.y, values };
}

function parseConnection(index: number, raw: unknown): Connection {
    const ref = (value: unknown, path: string) => {
        if (!isObj(value) || !isStr(value.node) || !isStr(value.pin)) return bad(path);
        const r = value as { node: string; pin: string };
        return { node: r.node, pin: r.pin };
    };

    if (!isObj(raw) || !isStr(raw.id) || FORBIDDEN_IDS.has(raw.id)) return bad(`connections[${index}]`);
    return { id: raw.id, from: ref(raw.from, `connections[${index}].from`), to: ref(raw.to, `connections[${index}].to`) };
}

function parseView(raw: unknown): SavedView | undefined {
    if (!isObj(raw) || !isNum(raw.x) || !isNum(raw.y) || !isNum(raw.z) || raw.z <= 0) return undefined;
    return { x: raw.x, y: raw.y, z: raw.z };
}

/**
 * Разбирает и проверяет файл. Структурные ошибки и неизвестные типы нод отклоняют файл целиком.
 * Недопустимые связи (несуществующие пины, несовместимые типы, циклы, лишние связи в один вход) не причина
 * терять весь граф: они отбрасываются, а их число возвращается в `droppedConnections`.
 */
export function parse(text: string, registry: Registry): ParseResult {
    try {
        let file: unknown;
        try {
            file = JSON.parse(text);
        } catch {
            throw new Invalid({ code: 'invalidJson' });
        }

        if (!isObj(file) || file.format !== FORMAT) throw new Invalid({ code: 'notTaofxFile' });
        if (!isNum(file.version) || !Number.isInteger(file.version) || file.version < 1) return bad('version');
        if (file.version > VERSION) throw new Invalid({ code: 'newerVersion', detail: String(file.version) });

        const data = migrate(file, file.version);
        const rawGraph = data.graph;
        if (!isObj(rawGraph) || !isObj(rawGraph.nodes) || !Array.isArray(rawGraph.connections)) return bad('graph');

        const graph = createGraph();
        for (const [key, raw] of Object.entries(rawGraph.nodes)) graph.nodes[key] = parseNode(key, raw);
        const connections = rawGraph.connections.map((c, i) => parseConnection(i, c));
        if (new Set(connections.map((c) => c.id)).size !== connections.length) bad('connections: duplicate id');

        for (const node of Object.values(graph.nodes)) {
            if (!registry.has(node.type)) throw new Invalid({ code: 'unknownNode', detail: node.type });
        }

        // Каждую связь проверяем так, как будто добавляем её в граф: недопустимые (и лишние в тот же вход) отбрасываем.
        const taken = new Set<string>();
        for (const c of connections) {
            const key = `${c.to.node}:${c.to.pin}`;
            if (taken.has(key) || !canConnect(graph, registry, c.from, c.to).ok) continue;
            taken.add(key);
            graph.connections.push(c);
        }

        return { ok: true, graph, view: parseView(data.view), droppedConnections: connections.length - graph.connections.length };
    } catch (e) {
        if (e instanceof Invalid) return { ok: false, error: e.error };
        throw e;
    }
}
