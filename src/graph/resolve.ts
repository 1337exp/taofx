import type { Registry } from './registry';
import { WIDTH, type DataType, type Graph, type PinRef, type PinType } from './types';

export type GraphErrorKind = 'unknownNode' | 'unknownPin' | 'cycle' | 'incompatible' | 'noOutput' | 'build';

export interface GraphError {
    kind: GraphErrorKind;
    message: string;
    nodeId?: string;
}

export interface ResolvedNode {
    inputs: Record<string, DataType>;
    outputs: Record<string, DataType>;
}

export interface Resolved {
    nodes: Record<string, ResolvedNode>;
    errors: GraphError[];
}

const GEN_ORDER: DataType[] = ['float', 'vec2', 'vec3', 'vec4'];

/**
 * Можно ли вести связь из пина типа `from` во вход типа `to`.
 * Разрешено: тот же размер (vec3 ↔ color) и float → любой (растягивается на все компоненты).
 * Сужение (vec3 → vec2) и добавление компонент запрещены: они молча теряли бы или выдумывали данные.
 */
export function canConnect(from: DataType, to: PinType): boolean {
    if (to === 'gen') return true;
    return WIDTH[from] === WIDTH[to] || from === 'float';
}

/** Самый широкий из типов; color считается vec3. */
function widest(types: DataType[]): DataType {
    let best: DataType = 'float';
    for (const t of types) {
        const n: DataType = t === 'color' ? 'vec3' : t;
        if (GEN_ORDER.indexOf(n) > GEN_ORDER.indexOf(best)) best = n;
    }
    return best;
}

/**
 * Выводит конкретные типы всех пинов: `gen`-пины ноды получают самый широкий тип среди подключённых
 * `gen`-входов (без подключений — float). Чистая функция графа и реестра: то же самое нужно и компилятору,
 * и будущему редактору (цвет пинов, проверка связей).
 */
export function resolveTypes(graph: Graph, registry: Registry): Resolved {
    const errors: GraphError[] = [];
    const nodes: Record<string, ResolvedNode> = {};
    const visiting = new Set<string>();

    const linkTo = (ref: PinRef) => graph.connections.find((c) => c.to.node === ref.node && c.to.pin === ref.pin);

    function resolve(id: string): ResolvedNode | null {
        if (nodes[id]) return nodes[id];
        const node = graph.nodes[id];
        const def = node && registry.get(node.type);
        if (!node || !def) {
            errors.push({ kind: 'unknownNode', message: `Unknown node type "${node?.type ?? id}"`, nodeId: id });
            return null;
        }
        if (visiting.has(id)) {
            errors.push({ kind: 'cycle', message: 'Graph has a cycle', nodeId: id });
            return null;
        }
        visiting.add(id);

        const genSources: DataType[] = [];
        const sourceTypes: Record<string, DataType | undefined> = {};
        for (const [name, pin] of Object.entries(def.inputs)) {
            const link = linkTo({ node: id, pin: name });
            if (!link) continue;
            const src = resolve(link.from.node);
            const srcType = src?.outputs[link.from.pin];
            if (src && srcType === undefined) {
                errors.push({ kind: 'unknownPin', message: `Node "${link.from.node}" has no output "${link.from.pin}"`, nodeId: link.from.node });
            }
            sourceTypes[name] = srcType;
            if (srcType && pin.type === 'gen') genSources.push(srcType);
        }

        const gen = widest(genSources);
        const concrete = (t: PinType): DataType => (t === 'gen' ? gen : t);
        const result: ResolvedNode = {
            inputs: Object.fromEntries(Object.entries(def.inputs).map(([n, p]) => [n, concrete(p.type)])),
            outputs: Object.fromEntries(Object.entries(def.outputs).map(([n, p]) => [n, concrete(p.type)])),
        };

        for (const [name, pin] of Object.entries(def.inputs)) {
            const srcType = sourceTypes[name];
            if (srcType && !canConnect(srcType, pin.type === 'gen' ? 'gen' : result.inputs[name]!)) {
                errors.push({ kind: 'incompatible', message: `Cannot connect ${srcType} to ${result.inputs[name]} (${id}.${name})`, nodeId: id });
            }
        }

        visiting.delete(id);
        nodes[id] = result;
        return result;
    }

    for (const id of Object.keys(graph.nodes)) resolve(id);
    return { nodes, errors };
}
