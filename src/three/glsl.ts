import { ShaderMaterial } from 'three';
import { compileGlsl } from '../glsl/compile';
import { buildThreeShader, TIME_UNIFORM } from '../glsl/targets';
import { loadGraph } from '../graph/load';
import type { Registry } from '../graph/registry';
import type { GraphError } from '../graph/resolve';
import type { Graph } from '../graph/types';
import { createDefaultRegistry } from '../nodes';

export interface GlslEffectOptions {
    /** Свои типы нод вместо встроенных (у них должны быть GLSL-эмиттеры). */
    registry?: Registry;
}

export interface GlslEffect {
    readonly graph: Graph;
    /** Материал для `Mesh` в сцене с обычным `WebGLRenderer`. */
    readonly material: ShaderMaterial;
    /** Ошибки сборки графа. Если они есть, материал пурпурный: ошибка видна в сцене, а игра не падает. */
    readonly errors: readonly GraphError[];
    /** Время эффекта в секундах (нода «Время»). Вызывайте каждый кадр. */
    setTime(seconds: number): void;
    dispose(): void;
}

const ERROR_PROGRAM = { target: 'three' as const, helpers: '', body: 'vec3 fxColor = vec3(1.0, 0.0, 1.0);\n    float fxOpacity = 1.0;' };

/**
 * Эффект из файла редактора для сцены на классическом `WebGLRenderer`: тот же граф, но собранный в GLSL
 * (`ShaderMaterial`), без TSL и без `three/webgpu`.
 *
 * ```ts
 * const effect = createGlslEffect(await (await fetch('fire.json')).text());
 * mesh.material = effect.material;
 * renderer.setAnimationLoop((t) => { effect.setTime(t / 1000); renderer.render(scene, camera); });
 * ```
 */
export function createGlslEffect(source: string | Graph, options: GlslEffectOptions = {}): GlslEffect {
    const registry = options.registry ?? createDefaultRegistry();
    const graph = loadGraph(source, registry);

    const { program, errors } = compileGlsl(graph, registry, 'three');
    const { vertexShader, fragmentShader } = buildThreeShader(program ?? ERROR_PROGRAM);
    const uniforms = { [TIME_UNIFORM]: { value: 0 } };
    const material = new ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true });

    return {
        graph,
        material,
        errors,
        setTime: (seconds) => {
            uniforms[TIME_UNIFORM].value = seconds;
        },
        dispose: () => material.dispose(),
    };
}
