import type { MeshBasicNodeMaterial } from 'three/webgpu';
import { loadGraph } from '../graph/load';
import type { Registry } from '../graph/registry';
import type { GraphError } from '../graph/resolve';
import type { Graph } from '../graph/types';
import { createDefaultRegistry } from '../nodes';
import { tslBuilders } from './builders';
import { compile } from './compile';
import { createSurfaceMaterial, errorSurface } from './material';
import type { TslBuild } from './types';

export interface EffectOptions {
    /** Свои типы нод вместо встроенных. */
    registry?: Registry;
    /** TSL-реализации для своих нод (встроенные подмешиваются). */
    builders?: Record<string, TslBuild>;
}

export interface Effect {
    /** Граф эффекта: чистые данные. */
    readonly graph: Graph;
    /** Материал для `Mesh`. Для работы нужен `WebGPURenderer` из `three/webgpu` (он сам откатывается на WebGL2). */
    readonly material: MeshBasicNodeMaterial;
    /** Ошибки сборки графа. Если они есть, материал пурпурный: ошибка видна в сцене, а игра не падает. */
    readonly errors: readonly GraphError[];
    /** Время эффекта в секундах (нода «Время»). Вызывайте каждый кадр; своё время позволяет ставить эффект на паузу и перематывать. */
    setTime(seconds: number): void;
    dispose(): void;
}

/**
 * Эффект из файла редактора (текст JSON) или из готового графа: разбор, сборка в TSL и материал.
 *
 * ```ts
 * const effect = createEffect(await (await fetch('fire.json')).text());
 * mesh.material = effect.material;
 * renderer.setAnimationLoop((t) => { effect.setTime(t / 1000); renderer.render(scene, camera); });
 * ```
 */
export function createEffect(source: string | Graph, options: EffectOptions = {}): Effect {
    const registry = options.registry ?? createDefaultRegistry();
    const graph = loadGraph(source, registry);

    const { surface, errors } = compile(graph, registry, { ...tslBuilders, ...options.builders });
    const used = surface ?? errorSurface();
    const material = createSurfaceMaterial(used);

    return {
        graph,
        material,
        errors,
        setTime: (seconds) => {
            used.time.value = seconds;
        },
        dispose: () => material.dispose(),
    };
}
