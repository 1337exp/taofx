import type { GlslSampler } from '../glsl/compile';
import type { Registry } from '../graph/registry';
import type { GraphError } from '../graph/resolve';
import { WIDTH, type Capability, type Constant, type DataType, type Graph, type WgslContext } from '../graph/types';
import { walkGraph, type WalkBackend } from '../graph/walk';

/**
 * Куда собираем WGSL: фильтр PIXI (`pixi`, есть исходная картинка) или частицы PIXI (`pixi-particles`) в рендерере WebGPU.
 * Цели те же, что у GLSL-версий PIXI, поэтому и возможности такие же.
 */
export type WgslTarget = 'pixi' | 'pixi-particles';

export const WGSL_CAPABILITIES: Record<WgslTarget, readonly Capability[]> = {
    pixi: ['source'],
    'pixi-particles': ['particle'],
};

export interface WgslProgram {
    target: WgslTarget;
    /** Текстуры графа: рантайм привязывает к `<uniform>` картинку, а к `<uniform>Sampler` её сэмплер. */
    samplers: GlslSampler[];
    /** Вспомогательные функции нод (шум и т.п.), каждая один раз. */
    helpers: string;
    /** Операторы: считают значения нод и объявляют `let fxColor: vec3<f32>` и `let fxOpacity: f32`. */
    body: string;
}

export interface WgslResult {
    program: WgslProgram | null;
    errors: GraphError[];
}

/**
 * Чтение картинки в PIXI: картинка с премультипликацией и в sRGB, начало сверху. Приводим к прямой альфе, линейному
 * цвету и началу снизу (как у three). Те же действия, что у `fxTex` в GLSL.
 */
const PIXI_TEXTURE_HELPER = `fn fxTex(t: texture_2d<f32>, s: sampler, uv: vec2<f32>) -> vec4<f32> {
    let c = textureSample(t, s, vec2<f32>(uv.x, 1.0 - uv.y));
    let rgb = select(vec3<f32>(0.0), c.rgb / max(c.a, 1e-9), c.a > 0.0);
    let lo = rgb / 12.92;
    let hi = pow((rgb + 0.055) / 1.055, vec3<f32>(2.4));
    return vec4<f32>(select(hi, lo, rgb <= vec3<f32>(0.04045)), c.a);
}`;

/** Тип WGSL: color это vec3. */
export const wgslType = (t: DataType): string => (t === 'float' ? 'f32' : t === 'vec2' ? 'vec2<f32>' : t === 'vec4' ? 'vec4<f32>' : 'vec3<f32>');

/** Число как литерал WGSL: с десятичной точкой или порядком, без NaN и бесконечностей. */
export function wgslFloat(n: number): string {
    if (!Number.isFinite(n)) return '0.0';
    const s = String(n);
    return /[.e]/i.test(s) ? s : `${s}.0`;
}

/** Константа нужного типа из числа или массива компонент (недостающие компоненты: нули, одиночное число растягивается). */
export function wgslConstant(type: DataType, value: Constant | undefined): string {
    const parts = Array.isArray(value) ? value : value === undefined ? [] : [value];
    const c = (i: number) => wgslFloat(parts[i] ?? (parts.length === 1 && type !== 'float' ? parts[0]! : 0));
    switch (type) {
        case 'float':
            return c(0);
        case 'vec2':
            return `vec2<f32>(${c(0)}, ${c(1)})`;
        case 'vec4':
            return `vec4<f32>(${c(0)}, ${c(1)}, ${c(2)}, ${wgslFloat(parts[3] ?? (parts.length === 1 ? parts[0]! : 1))})`;
        default:
            return `vec3<f32>(${c(0)}, ${c(1)}, ${c(2)})`;
    }
}

/** Приводит выражение к типу входа: тот же размер как есть, float растягивается на все компоненты. */
export function wgslCast(expr: string, from: DataType, to: DataType): string {
    if (WIDTH[from] === WIDTH[to]) return expr;
    if (from === 'float') return `${wgslType(to)}(${expr})`;
    throw new Error(`Cannot narrow ${from} to ${to}`);
}

/**
 * Собирает граф в WGSL. Порядок обхода и ошибки ведёт общий `walkGraph`, как и у GLSL; здесь только то, что относится к WGSL:
 * значение ноды это выражение, каждый выход кладётся в `let` (потребителей может быть несколько).
 */
export function compileWgsl(graph: Graph, registry: Registry, target: WgslTarget): WgslResult {
    const helpers = new Map<string, string>();
    const samplers: GlslSampler[] = [];
    const statements: string[] = [];
    let counter = 0;

    const backend: WalkBackend<string> = {
        capabilities: WGSL_CAPABILITIES[target],
        targetName: `the ${target} WGSL target`,
        constant: wgslConstant,
        uv: () => 'vUv',
        cast: wgslCast,
        unsupported: (def) => (def.wgsl ? null : `Node "${def.id}" has no WGSL implementation`),
        build(node, def, inputs, types) {
            const ctx: WgslContext = {
                types: types.inputs,
                params: node.params ?? {},
                helper: (name, code) => void (helpers.has(name) || helpers.set(name, code)),
                texture(name, uv) {
                    if (!graph.textures?.[name]) throw new Error(`Texture "${name}" is not in the graph`);
                    let sampler = samplers.find((x) => x.texture === name);
                    if (!sampler) samplers.push((sampler = { uniform: `uTex${samplers.length}`, texture: name }));
                    helpers.has('fxTex') || helpers.set('fxTex', PIXI_TEXTURE_HELPER);
                    return `fxTex(${sampler.uniform}, ${sampler.uniform}Sampler, ${uv})`;
                },
            };
            const emitted = def.wgsl!(inputs, ctx);

            const vars: Record<string, string> = {};
            for (const [pin, expr] of Object.entries(emitted)) {
                const type = types.outputs[pin];
                if (!type) continue;
                const name = `n${counter++}_${pin.replace(/\W/g, '_')}`;
                statements.push(`let ${name}: ${wgslType(type)} = ${expr};`);
                vars[pin] = name;
            }
            return vars;
        },
    };

    const { outputInputs, errors } = walkGraph(graph, registry, backend);
    if (!outputInputs) return { program: null, errors };

    statements.push(`let fxColor: vec3<f32> = ${outputInputs.color};`, `let fxOpacity: f32 = ${outputInputs.opacity};`);
    return { program: { target, samplers, helpers: [...helpers.values()].join('\n'), body: statements.join('\n    ') }, errors };
}
