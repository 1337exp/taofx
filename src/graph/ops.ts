import { uid } from '@1337exp/taoux/ids';
import type { Registry } from './registry';
import { canConnect as typesCompatible, resolveTypes, type GraphError } from './resolve';
import type { Connection, Graph, NodeDef, NodeInstance, PinRef, PinType } from './types';

export const createGraph = (): Graph => ({ nodes: {}, connections: [] });

export function addNode(
    graph: Graph,
    registry: Registry,
    type: string,
    init: Partial<Omit<NodeInstance, 'type'>> = {},
): NodeInstance {
    if (!registry.has(type)) throw new Error(`Unknown node type "${type}"`);

    const node: NodeInstance = {
        id: init.id ?? uid('n', (id) => id in graph.nodes),
        type,
        x: init.x ?? 0,
        y: init.y ?? 0,
        values: { ...init.values },
    };
    if (graph.nodes[node.id]) throw new Error(`Node "${node.id}" already exists`);

    graph.nodes[node.id] = node;
    return node;
}

export function removeNode(graph: Graph, nodeId: string): void {
    delete graph.nodes[nodeId];
    graph.connections = graph.connections.filter((c) => c.from.node !== nodeId && c.to.node !== nodeId);
}

export function disconnect(graph: Graph, connectionId: string): void {
    graph.connections = graph.connections.filter((c) => c.id !== connectionId);
}

export type ConnectFailure = 'missingNode' | 'sameNode' | 'noOutput' | 'noInput' | 'incompatible' | 'cycle';
export type ConnectCheck = { ok: true } | { ok: false; reason: ConnectFailure };

const fail = (reason: ConnectFailure): ConnectCheck => ({ ok: false, reason });
const errorKey = (e: GraphError) => `${e.kind}:${e.nodeId ?? ''}:${e.message}`;

/** Граф с новой связью: она заменяет прежнюю связь в тот же вход (в вход ведёт одна связь). */
function withLink(graph: Graph, link: Connection): Graph {
    return { nodes: graph.nodes, connections: [...graph.connections.filter((c) => !(c.to.node === link.to.node && c.to.pin === link.to.pin)), link] };
}

/**
 * Можно ли соединить выход `from` со входом `to`. Граф не меняет.
 * Типы и циклы проверяются пробным выводом типов всего графа с новой связью: связь может расширить `gen`-ноду
 * и сломать то, что идёт за ней (vec3 в вход float), и такая связь недопустима.
 */
export function canConnect(graph: Graph, registry: Registry, from: PinRef, to: PinRef): ConnectCheck {
    const fromNode = graph.nodes[from.node];
    const toNode = graph.nodes[to.node];
    if (!fromNode || !toNode) return fail('missingNode');
    if (from.node === to.node) return fail('sameNode');

    const fromDef = registry.get(fromNode.type);
    const toDef = registry.get(toNode.type);
    if (!fromDef || !(from.pin in fromDef.outputs)) return fail('noOutput');
    if (!toDef || !(to.pin in toDef.inputs)) return fail('noInput');

    const known = new Set(resolveTypes(graph, registry).errors.map(errorKey));
    const trial = resolveTypes(withLink(graph, { id: '?', from, to }), registry);
    const added = trial.errors.filter((e) => !known.has(errorKey(e)));
    if (added.some((e) => e.kind === 'cycle')) return fail('cycle');
    return added.length > 0 ? fail('incompatible') : { ok: true };
}

/** Соединяет пины. Бросает ошибку, если нельзя. Прежняя связь в тот же вход заменяется. */
export function connect(graph: Graph, registry: Registry, from: PinRef, to: PinRef): Connection {
    const check = canConnect(graph, registry, from, to);
    if (!check.ok) throw new Error(`Cannot connect: ${check.reason}`);

    graph.connections = graph.connections.filter((c) => !(c.to.node === to.node && c.to.pin === to.pin));
    const connection: Connection = { id: uid('c', (id) => graph.connections.some((c) => c.id === id)), from: { ...from }, to: { ...to } };
    graph.connections.push(connection);
    return connection;
}

export interface PinOrigin {
    /** Конкретный тип пина, с которого тянули (для `gen` передают выведенный). */
    type: PinType;
    /** `out`: тянули от выхода, ищем вход; `in`: тянули от входа, ищем выход. */
    dir: 'in' | 'out';
}

/**
 * Пин ноды `def`, к которому можно подключить пин `origin`: точный тип предпочитаем `gen`, `gen` предпочитаем
 * остальным совместимым. Если подходящего нет, null. Нужен палитре: нода, созданная протягиванием связи,
 * подключается сразу.
 */
export function findCompatiblePin(origin: PinOrigin, def: NodeDef): string | null {
    const wantInputs = origin.dir === 'out';
    const pins = Object.entries(wantInputs ? def.inputs : def.outputs);

    const fits = (pinType: PinType): boolean => {
        if (wantInputs) return origin.type !== 'gen' && typesCompatible(origin.type, pinType);
        // от входа тянут к выходу: выход должен «влезать» во вход origin
        return origin.type === 'gen' || pinType === 'gen' || typesCompatible(pinType, origin.type);
    };

    const candidates = pins.filter(([, p]) => fits(p.type));
    const exact = candidates.find(([, p]) => p.type === origin.type);
    const generic = candidates.find(([, p]) => p.type === 'gen');
    return (exact ?? generic ?? candidates[0])?.[0] ?? null;
}
