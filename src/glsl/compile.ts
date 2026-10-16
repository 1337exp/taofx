import type { Registry } from '../graph/registry';
import type { GraphError } from '../graph/resolve';
import { WIDTH, type Capability, type Constant, type DataType, type Graph, type GlslContext } from '../graph/types';
import { walkGraph, type WalkBackend } from '../graph/walk';

/**
 * Куда собираем GLSL: `three` (ShaderMaterial на 3D-меше, есть нормаль) или `pixi` (фильтр спрайта, есть исходная картинка).
 * Цель определяет, какие ноды допустимы (`NodeDef.needs`) и в какой каркас шейдера встанет результат.
 */
export type GlslTarget = 'three' | 'pixi' | 'three-particles' | 'pixi-particles';

export const GLSL_CAPABILITIES: Record<GlslTarget, readonly Capability[]> = {
    three: ['normal'],
    pixi: ['source'],
    'three-particles': ['particle'],
    'pixi-particles': ['particle'],
};

/** Текстура графа в шейдере: имя uniform и имя картинки в `Graph.textures`. */
export interface GlslSampler {
    uniform: string;
    texture: string;
}

export interface GlslProgram {
    target: GlslTarget;
    /** Объявления `uniform sampler2D` для текстур, которые читают ноды. */
    uniforms: string;
    /** Текстуры, к которым рантайм привязывает картинки. */
    samplers: GlslSampler[];
    /** Вспомогательные функции нод (шум и т.п.), каждая один раз. */
    helpers: string;
    /** Операторы: считают значения нод и объявляют `vec3 fxColor` и `float fxOpacity`. */
    body: string;
}

export interface GlslResult {
    program: GlslProgram | null;
    errors: GraphError[];
}

const PIXI_TEXTURE_HELPER = `vec4 fxTex(sampler2D s, vec2 uv) {
    vec4 c = texture(s, vec2(uv.x, 1.0 - uv.y));
    vec3 rgb = c.a > 0.0 ? c.rgb / c.a : vec3(0.0);
    vec3 lo = rgb / 12.92;
    vec3 hi = pow((rgb + 0.055) / 1.055, vec3(2.4));
    return vec4(mix(hi, lo, lessThanEqual(rgb, vec3(0.04045))), c.a);
}`;

/** Тип GLSL: color это vec3. */
export const glslType = (t: DataType): string => (t === 'float' ? 'float' : t === 'vec2' ? 'vec2' : t === 'vec4' ? 'vec4' : 'vec3');

/** Число как литерал GLSL: всегда с десятичной точкой или порядком, без NaN и бесконечностей. */
export function glslFloat(n: number): string {
    if (!Number.isFinite(n)) return '0.0';
    const s = String(n);
    return /[.e]/i.test(s) ? s : `${s}.0`;
}

/** Константа нужного типа из числа или массива компонент (недостающие компоненты: нули, одиночное число растягивается). */
export function glslConstant(type: DataType, value: Constant | undefined): string {
    const parts = Array.isArray(value) ? value : value === undefined ? [] : [value];
    const c = (i: number) => glslFloat(parts[i] ?? (parts.length === 1 && type !== 'float' ? parts[0]! : 0));
    switch (type) {
        case 'float':
            return c(0);
        case 'vec2':
            return `vec2(${c(0)}, ${c(1)})`;
        case 'vec4':
            return `vec4(${c(0)}, ${c(1)}, ${c(2)}, ${glslFloat(parts[3] ?? (parts.length === 1 ? parts[0]! : 1))})`;
        default:
            return `vec3(${c(0)}, ${c(1)}, ${c(2)})`;
    }
}

/** Приводит выражение к типу входа: тот же размер как есть, float растягивается на все компоненты. */
export function glslCast(expr: string, from: DataType, to: DataType): string {
    if (WIDTH[from] === WIDTH[to]) return expr;
    if (from === 'float') return `${glslType(to)}(${expr})`;
    throw new Error(`Cannot narrow ${from} to ${to}`);
}

/**
 * Собирает граф в GLSL. Порядок обхода и ошибки ведёт общий `walkGraph`; здесь только то, что относится к GLSL:
 * значение ноды это выражение, каждый выход кладётся в переменную (потребителей может быть несколько, и выражения не раздуваются).
 */
export function compileGlsl(graph: Graph, registry: Registry, target: GlslTarget): GlslResult {
    const helpers = new Map<string, string>();
    const samplers: GlslSampler[] = [];
    const statements: string[] = [];
    let counter = 0;

    const backend: WalkBackend<string> = {
        capabilities: GLSL_CAPABILITIES[target],
        targetName: `the ${target} target`,
        constant: glslConstant,
        uv: () => 'vUv',
        cast: glslCast,
        unsupported: (def) => (def.glsl ? null : `Node "${def.id}" has no GLSL implementation`),
        build(node, def, inputs, types) {
            const ctx: GlslContext = {
                types: types.inputs,
                params: node.params ?? {},
                helper: (name, code) => void (helpers.has(name) || helpers.set(name, code)),
                texture(name, uv) {
                    if (!graph.textures?.[name]) throw new Error(`Texture "${name}" is not in the graph`);
                    let sampler = samplers.find((x) => x.texture === name);
                    if (!sampler) samplers.push((sampler = { uniform: `uTex${samplers.length}`, texture: name }));
                    if (target === 'pixi' || target === 'pixi-particles') {
                        // PIXI: картинка с премультипликацией и в sRGB, начало сверху: приводим к прямой альфе, линейному цвету и началу снизу
                        helpers.has('fxTex') || helpers.set('fxTex', PIXI_TEXTURE_HELPER);
                        return `fxTex(${sampler.uniform}, ${uv})`;
                    }
                    return `texture(${sampler.uniform}, ${uv})`;
                },
            };
            const emitted = def.glsl!(inputs, ctx);

            // значение каждого выхода кладём в переменную: потребителей может быть несколько
            const vars: Record<string, string> = {};
            for (const [pin, expr] of Object.entries(emitted)) {
                const type = types.outputs[pin];
                if (!type) continue;
                const name = `n${counter++}_${pin.replace(/\W/g, '_')}`;
                statements.push(`${glslType(type)} ${name} = ${expr};`);
                vars[pin] = name;
            }
            return vars;
        },
    };

    const { outputInputs, errors } = walkGraph(graph, registry, backend);
    if (!outputInputs) return { program: null, errors };

    statements.push(`vec3 fxColor = ${outputInputs.color};`, `float fxOpacity = ${outputInputs.opacity};`);
    const uniforms = samplers.map((x) => `uniform sampler2D ${x.uniform};`).join('\n');
    return { program: { target, uniforms, samplers, helpers: [...helpers.values()].join('\n'), body: statements.join('\n    ') }, errors };
}
