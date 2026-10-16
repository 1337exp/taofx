import { checkCapabilities } from '../graph/capabilities';
import type { Registry } from '../graph/registry';
import { resolveTypes, type GraphError } from '../graph/resolve';
import { OUTPUT_NODE, WIDTH, type Capability, type Constant, type DataType, type Graph, type GlslContext, type PinRef } from '../graph/types';

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

export interface GlslProgram {
    target: GlslTarget;
    /** Вспомогательные функции нод (шум и т.п.), каждая один раз. */
    helpers: string;
    /** Операторы: считают значения нод и объявляют `vec3 fxColor` и `float fxOpacity`. */
    body: string;
}

export interface GlslResult {
    program: GlslProgram | null;
    errors: GraphError[];
}

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
 * Собирает граф в GLSL. Идём от ноды-выхода к источникам: что не ведёт к выходу, не попадает в шейдер.
 * Значение каждой ноды считается один раз и кладётся в переменную, поэтому выражения не раздуваются, если выход
 * используют несколько потребителей.
 */
export function compileGlsl(graph: Graph, registry: Registry, target: GlslTarget): GlslResult {
    const { nodes: types, errors } = resolveTypes(graph, registry);
    const fail = (e: GraphError) => errors.push(e);

    const outId = Object.keys(graph.nodes).find((id) => graph.nodes[id]!.type === OUTPUT_NODE);
    if (!outId) {
        fail({ kind: 'noOutput', message: `Graph has no "${OUTPUT_NODE}" node` });
        return { program: null, errors };
    }
    errors.push(...checkCapabilities(graph, registry, GLSL_CAPABILITIES[target], `the ${target} target`));
    if (!types[outId] || errors.length > 0) return { program: null, errors };

    const helpers = new Map<string, string>();
    const statements: string[] = [];
    const linkTo = (ref: PinRef) => graph.connections.find((c) => c.to.node === ref.node && c.to.pin === ref.pin);
    const built = new Map<string, Record<string, string>>();
    let counter = 0;

    function inputsOf(id: string): Record<string, string> {
        const node = graph.nodes[id]!;
        const def = registry.get(node.type)!;
        const rt = types[id]!;
        const values: Record<string, string> = {};

        for (const [name, pin] of Object.entries(def.inputs)) {
            const to = rt.inputs[name]!;
            const link = linkTo({ node: id, pin: name });
            const expr = link ? outputsOf(link.from.node)?.[link.from.pin] : undefined;
            const from = link && types[link.from.node]?.outputs[link.from.pin];
            values[name] = expr !== undefined && from ? glslCast(expr, from, to) : glslConstant(to, node.values[name] ?? pin.default);
        }
        return values;
    }

    function outputsOf(id: string): Record<string, string> | null {
        const cached = built.get(id);
        if (cached) return cached;
        const node = graph.nodes[id];
        const def = node && registry.get(node.type);
        if (!def || !types[id]) return null; // ошибка уже записана при выводе типов
        if (!def.glsl) {
            fail({ kind: 'unsupported', message: `Node "${def.id}" has no GLSL implementation`, nodeId: id });
            return null;
        }

        try {
            const ctx: GlslContext = {
                types: types[id]!.inputs,
                helper: (name, code) => void (helpers.has(name) || helpers.set(name, code)),
            };
            const emitted = def.glsl(inputsOf(id), ctx);

            // значение каждого выхода кладём в переменную: потребителей может быть несколько
            const vars: Record<string, string> = {};
            for (const [pin, expr] of Object.entries(emitted)) {
                const type = types[id]!.outputs[pin];
                if (!type) continue;
                const name = `n${counter++}_${pin.replace(/\W/g, '_')}`;
                statements.push(`${glslType(type)} ${name} = ${expr};`);
                vars[pin] = name;
            }
            built.set(id, vars);
            return vars;
        } catch (e) {
            fail({ kind: 'build', message: e instanceof Error ? e.message : String(e), nodeId: id });
            return null;
        }
    }

    let inputs: Record<string, string>;
    try {
        inputs = inputsOf(outId);
    } catch (e) {
        fail({ kind: 'build', message: e instanceof Error ? e.message : String(e), nodeId: outId });
        return { program: null, errors };
    }
    if (errors.length > 0) return { program: null, errors };

    statements.push(`vec3 fxColor = ${inputs.color};`, `float fxOpacity = ${inputs.opacity};`);
    return { program: { target, helpers: [...helpers.values()].join('\n'), body: statements.join('\n    ') }, errors };
}
