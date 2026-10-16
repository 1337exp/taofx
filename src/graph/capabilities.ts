import type { Registry } from './registry';
import type { GraphError } from './resolve';
import { OUTPUT_NODE, type Capability, type Graph } from './types';

/** Все ноды, от которых зависит нода `nodeId` (она сама тоже): только они попадают в результат, остальные не строятся. */
export function upstreamOf(graph: Graph, nodeId: string): Set<string> {
    const seen = new Set<string>();
    const stack = [nodeId];
    for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
        if (seen.has(id)) continue;
        seen.add(id);
        for (const c of graph.connections) if (c.to.node === id) stack.push(c.from.node);
    }
    return seen;
}

/**
 * Ноды, которым нужно то, чего цель не даёт (нормаль у PIXI-фильтра, картинка у 3D-материала). Проверяются только ноды,
 * от которых зависит результат: лишняя неподключённая нода сборку не ломает.
 */
export function checkCapabilities(graph: Graph, registry: Registry, provides: readonly Capability[], targetName: string): GraphError[] {
    const out = Object.keys(graph.nodes).find((id) => graph.nodes[id]!.type === OUTPUT_NODE);
    if (!out) return [];

    const errors: GraphError[] = [];
    for (const id of upstreamOf(graph, out)) {
        const def = registry.get(graph.nodes[id]!.type);
        const missing = def?.needs?.filter((c) => !provides.includes(c)) ?? [];
        if (missing.length > 0) {
            errors.push({ kind: 'unsupported', message: `${def!.title} needs ${missing.join(', ')}, which ${targetName} does not provide`, nodeId: id });
        }
    }
    return errors;
}
