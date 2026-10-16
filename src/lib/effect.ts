import type { MeshBasicNodeMaterial } from 'three/webgpu';
import { compile } from '../graph/compile';
import { createSurfaceMaterial, errorSurface } from '../graph/material';
import { parse, type LoadError } from '../graph/serialize';
import type { Registry } from '../graph/registry';
import type { GraphError } from '../graph/resolve';
import type { Graph } from '../graph/types';
import { createDefaultRegistry } from '../nodes';

/** Файл эффекта не удалось прочитать: причина в `error.code` (`invalidJson`, `notTaofxFile`, `newerVersion`, ...). */
export class EffectLoadError extends Error {
    constructor(readonly error: LoadError) {
        super(`Cannot load effect: ${error.code}${error.detail ? ` (${error.detail})` : ''}`);
        this.name = 'EffectLoadError';
    }
}

export interface EffectOptions {
    /** Свои типы нод вместо встроенных. */
    registry?: Registry;
}

export interface Effect {
    /** Граф эффекта: чистые данные. */
    readonly graph: Graph;
    /** Материал для `Mesh`. Для работы нужен `WebGPURenderer` из `three/webgpu` (он сам откатывается на WebGL2). */
    readonly material: MeshBasicNodeMaterial;
    /** Ошибки сборки графа. Если они есть, материал пурпурный: ошибка видна в сцене, а игра не падает. */
    readonly errors: readonly GraphError[];
    dispose(): void;
}

/**
 * Эффект из файла редактора (текст JSON) или из готового графа: разбор, сборка в TSL и материал.
 *
 * ```ts
 * const effect = createEffect(await (await fetch('fire.json')).text());
 * mesh.material = effect.material;
 * ```
 */
export function createEffect(source: string | Graph, options: EffectOptions = {}): Effect {
    const registry = options.registry ?? createDefaultRegistry();

    let graph: Graph;
    if (typeof source === 'string') {
        const result = parse(source, registry);
        if (!result.ok) throw new EffectLoadError(result.error);
        graph = result.graph;
    } else {
        graph = source;
    }

    const { surface, errors } = compile(graph, registry);
    const material = createSurfaceMaterial(surface ?? errorSurface());

    return { graph, material, errors, dispose: () => material.dispose() };
}
