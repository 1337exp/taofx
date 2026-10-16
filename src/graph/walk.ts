import { checkCapabilities } from './capabilities';
import type { Registry } from './registry';
import { resolveTypes, type GraphError, type ResolvedNode } from './resolve';
import { OUTPUT_NODE, type Capability, type Constant, type DataType, type Graph, type NodeDef, type NodeInstance, type PinRef } from './types';

/**
 * Что бэкенд (GLSL, TSL) даёт обходчику графа. Значение `V` у каждого бэкенда своё: у GLSL это строка-выражение,
 * у TSL узел. Обходчик не знает, что внутри: он только решает, в каком порядке и из чего строить.
 */
export interface WalkBackend<V> {
    /** Что цель даёт нодам (нормаль, картинка, данные частицы). */
    capabilities: readonly Capability[];
    /** Как цель называется в сообщении об ошибке («the three target», «TSL»). */
    targetName: string;
    /** Значение неподключённого входа из константы. */
    constant(type: DataType, value: Constant | undefined): V;
    /** Значение для входа с `fallback: 'uv'`: координаты самой поверхности. */
    uv(): V;
    /** Приводит значение к типу входа (float растягивается, сужение бросает). */
    cast(value: V, from: DataType, to: DataType): V;
    /** Почему нода не собирается этим бэкендом (например, нет реализации) или null, если собирается. */
    unsupported(def: NodeDef): string | null;
    /** Строит выходы ноды из значений её входов. Бросает, если нода не собирается: ошибка запишется на ноду. */
    build(node: NodeInstance, def: NodeDef, inputs: Record<string, V>, types: ResolvedNode): Record<string, V>;
}

export interface WalkResult<V> {
    /** Значения входов ноды-выхода (`color`, `opacity`) или null, если граф не собрался. */
    outputInputs: Record<string, V> | null;
    errors: GraphError[];
}

/**
 * Обходит граф от ноды-выхода к источникам и строит значения через бэкенд. Что не ведёт к выходу, не строится.
 * Каждая нода строится один раз, даже если её выходов несколько и потребителей тоже; упавшая нода даёт одну ошибку,
 * а не по ошибке на каждого потребителя.
 */
export function walkGraph<V>(graph: Graph, registry: Registry, backend: WalkBackend<V>): WalkResult<V> {
    const { nodes: types, errors } = resolveTypes(graph, registry);
    const fail = (e: GraphError) => errors.push(e);

    const outId = Object.keys(graph.nodes).find((id) => graph.nodes[id]!.type === OUTPUT_NODE);
    if (!outId) {
        fail({ kind: 'noOutput', message: `Graph has no "${OUTPUT_NODE}" node` });
        return { outputInputs: null, errors };
    }
    errors.push(...checkCapabilities(graph, registry, backend.capabilities, backend.targetName));
    if (!types[outId] || errors.length > 0) return { outputInputs: null, errors };

    const linkTo = (ref: PinRef) => graph.connections.find((c) => c.to.node === ref.node && c.to.pin === ref.pin);
    const built = new Map<string, Record<string, V>>();
    const failedNodes = new Set<string>();

    function inputsOf(id: string): Record<string, V> {
        const node = graph.nodes[id]!;
        const def = registry.get(node.type)!;
        const rt = types[id]!;
        const values: Record<string, V> = {};

        for (const [name, pin] of Object.entries(def.inputs)) {
            const to = rt.inputs[name]!;
            const link = linkTo({ node: id, pin: name });
            if (!link) {
                values[name] = pin.fallback === 'uv' ? backend.uv() : backend.constant(to, node.values[name] ?? pin.default);
                continue;
            }
            const out = outputsOf(link.from.node)?.[link.from.pin];
            const from = types[link.from.node]?.outputs[link.from.pin];
            // источник не собрался (ошибка уже записана): подставляем значение по умолчанию, чтобы дойти до остальных ошибок
            values[name] = out !== undefined && from ? backend.cast(out, from, to) : backend.constant(to, pin.default);
        }
        return values;
    }

    function outputsOf(id: string): Record<string, V> | null {
        const cached = built.get(id);
        if (cached) return cached;
        if (failedNodes.has(id)) return null;
        const node = graph.nodes[id];
        const def = node && registry.get(node.type);
        if (!node || !def || !types[id]) return null; // ошибка уже записана при выводе типов

        const why = backend.unsupported(def);
        if (why) {
            failedNodes.add(id);
            fail({ kind: 'unsupported', message: why, nodeId: id });
            return null;
        }

        try {
            const result = backend.build(node, def, inputsOf(id), types[id]!);
            built.set(id, result);
            return result;
        } catch (e) {
            failedNodes.add(id);
            fail({ kind: 'build', message: e instanceof Error ? e.message : String(e), nodeId: id });
            return null;
        }
    }

    let outputInputs: Record<string, V>;
    try {
        outputInputs = inputsOf(outId);
    } catch (e) {
        fail({ kind: 'build', message: e instanceof Error ? e.message : String(e), nodeId: outId });
        return { outputInputs: null, errors };
    }
    return { outputInputs: errors.length > 0 ? null : outputInputs, errors };
}
