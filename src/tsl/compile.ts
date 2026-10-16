import { color, float, uniform, vec2, vec3, vec4 } from 'three/tsl';
import { checkCapabilities } from '../graph/capabilities';
import type { Registry } from '../graph/registry';
import { resolveTypes, type GraphError } from '../graph/resolve';
import { OUTPUT_NODE, WIDTH, type Capability, type Constant, type DataType, type Graph, type PinRef } from '../graph/types';
import { tslBuilders } from './builders';
import type { TslBuild, TslValue } from './types';

export { OUTPUT_NODE };

/** Что TSL-цель даёт нодам: нормаль поверхности есть, картинки-источника нет. */
export const TSL_CAPABILITIES: readonly Capability[] = ['normal'];

export interface CompiledSurface {
    /** Цвет поверхности (vec3). */
    color: TslValue;
    /** Непрозрачность (float). */
    opacity: TslValue;
    /** Время эффекта в секундах: uniform, который вызывающий обновляет каждый кадр (`time.value = t`). */
    time: TslValue;
}

export interface CompileResult {
    surface: CompiledSurface | null;
    errors: GraphError[];
}

/** Константа нужного типа из числа или массива компонент (недостающие компоненты — нули). */
export function constant(type: DataType, value: Constant | undefined): TslValue {
    const parts = Array.isArray(value) ? value : value === undefined ? [] : [value];
    const c = (i: number) => parts[i] ?? (parts.length === 1 && type !== 'float' ? parts[0]! : 0);
    switch (type) {
        case 'float':
            return float(c(0));
        case 'vec2':
            return vec2(c(0), c(1));
        case 'vec3':
            return vec3(c(0), c(1), c(2));
        case 'vec4':
            return vec4(c(0), c(1), c(2), parts[3] ?? (parts.length === 1 ? parts[0]! : 1));
        case 'color':
            return color(c(0), c(1), c(2));
    }
}

/** Приводит значение к типу входа: тот же размер остаётся как есть, float растягивается на все компоненты. */
export function cast(value: TslValue, from: DataType, to: DataType): TslValue {
    if (WIDTH[from] === WIDTH[to]) return to === 'color' || from === 'color' ? vec3(value) : value;
    switch (to) {
        case 'vec2':
            return vec2(value);
        case 'vec3':
        case 'color':
            return vec3(value);
        case 'vec4':
            return vec4(value);
        case 'float':
            throw new Error(`Cannot narrow ${from} to float`);
    }
}

/**
 * Собирает граф в значения TSL. Идём от ноды-выхода к источникам: что не ведёт к выходу, не строится.
 * Каждая нода строится один раз, даже если её выход используют несколько потребителей.
 * `builders` позволяет подставить свои реализации нод (по умолчанию встроенные).
 */
export function compile(graph: Graph, registry: Registry, builders: Record<string, TslBuild> = tslBuilders): CompileResult {
    const { nodes: types, errors } = resolveTypes(graph, registry);
    const fail = (e: GraphError) => errors.push(e);

    const outId = Object.keys(graph.nodes).find((id) => graph.nodes[id]!.type === OUTPUT_NODE);
    if (!outId) {
        fail({ kind: 'noOutput', message: `Graph has no "${OUTPUT_NODE}" node` });
        return { surface: null, errors };
    }
    errors.push(...checkCapabilities(graph, registry, TSL_CAPABILITIES, 'TSL'));

    const time = uniform(0);
    const linkTo = (ref: PinRef) => graph.connections.find((c) => c.to.node === ref.node && c.to.pin === ref.pin);
    const built = new Map<string, Record<string, TslValue>>();

    function inputsOf(id: string): Record<string, TslValue> {
        const node = graph.nodes[id]!;
        const def = registry.get(node.type)!;
        const rt = types[id]!;
        const values: Record<string, TslValue> = {};

        for (const [name, pin] of Object.entries(def.inputs)) {
            const to = rt.inputs[name]!;
            const link = linkTo({ node: id, pin: name });
            if (link) {
                const out = outputsOf(link.from.node)?.[link.from.pin];
                const from = types[link.from.node]?.outputs[link.from.pin];
                values[name] = out !== undefined && from ? cast(out, from, to) : constant(to, pin.default);
            } else {
                values[name] = constant(to, node.values[name] ?? pin.default);
            }
        }
        return values;
    }

    function outputsOf(id: string): Record<string, TslValue> | null {
        const cached = built.get(id);
        if (cached) return cached;
        const node = graph.nodes[id];
        const def = node && registry.get(node.type);
        if (!def || !types[id]) return null; // ошибка уже записана при выводе типов

        const build = builders[def.id];
        if (!build) {
            fail({ kind: 'unsupported', message: `Node "${def.id}" has no TSL implementation`, nodeId: id });
            return null;
        }

        try {
            const result = build(inputsOf(id), { time });
            built.set(id, result);
            return result;
        } catch (e) {
            fail({ kind: 'build', message: e instanceof Error ? e.message : String(e), nodeId: id });
            return null;
        }
    }

    if (!types[outId] || errors.length > 0) return { surface: null, errors };
    let inputs: Record<string, TslValue>;
    try {
        inputs = inputsOf(outId);
    } catch (e) {
        fail({ kind: 'build', message: e instanceof Error ? e.message : String(e), nodeId: outId });
        return { surface: null, errors };
    }

    if (errors.length > 0) return { surface: null, errors };
    return { surface: { color: inputs.color, opacity: inputs.opacity, time }, errors };
}
