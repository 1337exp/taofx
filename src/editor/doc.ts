import type { Registry } from '@/graph/registry';
import { parse, serialize, type LoadError } from '@/graph/serialize';
import type { Graph, SavedView } from '@/graph/types';
import { createGraph } from '@/graph/ops';
import { parseParticles, PARTICLES_FORMAT, serializeParticles } from '@/particles/serialize';
import type { SystemDef } from '@/particles/types';

/**
 * Документ редактора: граф материала и, если это система частиц, её параметры. Без `system` это обычный материал.
 * В файл он пишется в одном из двух форматов: `taofx` (материал) или `taofx-particles` (система и материал частицы).
 */
export interface EditorDoc {
    graph: Graph;
    system: SystemDef | null;
}

export const emptyDoc = (): EditorDoc => ({ graph: createGraph(), system: null });

/** Граф для записи: картинки, на которые не ссылается ни одна нода, в файл не попадают (иначе он тащил бы старые загрузки). */
export function withUsedTextures(graph: Graph): Graph {
    if (!graph.textures) return graph;
    const used = new Set(Object.values(graph.nodes).flatMap((n) => Object.values(n.params ?? {})));
    const textures = Object.fromEntries(Object.entries(graph.textures).filter(([name]) => used.has(name)));
    const { textures: _all, ...rest } = graph;
    return Object.keys(textures).length > 0 ? { ...rest, textures } : rest;
}

export function serializeDoc(doc: EditorDoc, view: SavedView | undefined, pretty: boolean): string {
    const graph = withUsedTextures(doc.graph);
    return doc.system ? serializeParticles({ system: doc.system, material: graph }, pretty, view) : serialize(graph, view, pretty);
}

export type ParseDocResult = { ok: true; doc: EditorDoc; view?: SavedView; dropped: number } | { ok: false; error: LoadError };

/** Читает файл любого из двух форматов. */
export function parseDoc(text: string, registry: Registry): ParseDocResult {
    let format: unknown;
    try {
        format = (JSON.parse(text) as { format?: unknown } | null)?.format;
    } catch {
        format = undefined;
    }

    if (format === PARTICLES_FORMAT) {
        const r = parseParticles(text, registry);
        return r.ok ? { ok: true, doc: { graph: r.file.material, system: r.file.system }, view: r.view, dropped: r.droppedConnections } : r;
    }
    const r = parse(text, registry);
    return r.ok ? { ok: true, doc: { graph: r.graph, system: null }, view: r.view, dropped: r.droppedConnections } : r;
}
