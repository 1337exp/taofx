import { defaultFilterVert, Filter, GlProgram } from 'pixi.js';
import { compileGlsl } from '../glsl/compile';
import { buildPixiFragment, TIME_UNIFORM } from '../glsl/targets';
import { loadGraph } from '../graph/load';
import type { Registry } from '../graph/registry';
import type { GraphError } from '../graph/resolve';
import type { Graph } from '../graph/types';
import { createDefaultRegistry } from '../nodes';

export interface PixiEffectOptions {
    /** Свои типы нод вместо встроенных (у них должны быть GLSL-эмиттеры). */
    registry?: Registry;
}

export interface PixiEffect {
    readonly graph: Graph;
    /** Фильтр для `sprite.filters = [effect.filter]`. Работает в рендерере PIXI на WebGL (`preference: 'webgl'`). */
    readonly filter: Filter;
    /** Ошибки сборки графа. Если они есть, фильтр заливает силуэт пурпурным: ошибка видна на экране, а игра не падает. */
    readonly errors: readonly GraphError[];
    /** Время эффекта в секундах (нода «Время»). Вызывайте каждый кадр. */
    setTime(seconds: number): void;
    dispose(): void;
}

const ERROR_PROGRAM = { target: 'pixi' as const, helpers: '', body: 'vec3 fxColor = vec3(1.0, 0.0, 1.0);\n    float fxOpacity = 1.0;' };

/**
 * Эффект из файла редактора как фильтр PIXI v8: тот же граф, собранный в GLSL. Эффект рисуется внутри силуэта спрайта
 * (непрозрачность умножается на альфу картинки), нода «Исходная картинка» даёт доступ к цвету самого спрайта.
 * Фильтр содержит только программу WebGL: для рендерера WebGPU PIXI его пропустит (нужен WGSL-бэкенд).
 *
 * ```ts
 * const effect = createPixiEffect(await (await fetch('fire.json')).text());
 * sprite.filters = [effect.filter];
 * app.ticker.add((t) => effect.setTime(performance.now() / 1000));
 * ```
 */
export function createPixiEffect(source: string | Graph, options: PixiEffectOptions = {}): PixiEffect {
    const registry = options.registry ?? createDefaultRegistry();
    const graph = loadGraph(source, registry);

    const { program, errors } = compileGlsl(graph, registry, 'pixi');
    const fragment = buildPixiFragment(program ?? ERROR_PROGRAM);
    const filter = new Filter({
        glProgram: new GlProgram({ vertex: defaultFilterVert, fragment, name: 'taofx-effect' }),
        resources: { fxUniforms: { [TIME_UNIFORM]: { value: 0, type: 'f32' } } },
    });

    return {
        graph,
        filter,
        errors,
        setTime: (seconds) => {
            filter.resources.fxUniforms.uniforms[TIME_UNIFORM] = seconds;
        },
        dispose: () => filter.destroy(),
    };
}
