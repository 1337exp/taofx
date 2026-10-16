import { color, float, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import type { Registry } from '../graph/registry';
import type { GraphError } from '../graph/resolve';
import { OUTPUT_NODE, WIDTH, type Capability, type Constant, type DataType, type Graph } from '../graph/types';
import { walkGraph, type WalkBackend } from '../graph/walk';
import { tslBuilders } from './builders';
import { graphTextures, type TextureLookup } from './textures';
import type { TslBuild, TslParticleInputs, TslValue } from './types';

export { OUTPUT_NODE };

/** Что TSL-цель даёт нодам: нормаль поверхности есть, картинки-источника нет. */
export const TSL_CAPABILITIES: readonly Capability[] = ['normal'];

/** Система частиц даёт данные частицы, но не нормаль. */
export const TSL_PARTICLE_CAPABILITIES: readonly Capability[] = ['particle'];

export interface CompileOptions {
    /** Сборка для системы частиц: данные частицы из инстансных атрибутов. */
    particle?: TslParticleInputs;
    /** Откуда брать текстуры нод; по умолчанию картинки из `graph.textures`. */
    textures?: TextureLookup;
}

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
 * Собирает граф в значения TSL. Порядок обхода и ошибки ведёт общий `walkGraph`; здесь только то, что относится к TSL:
 * значение ноды это узел TSL, реализации нод берутся из `builders` (по умолчанию встроенные).
 */
export function compile(graph: Graph, registry: Registry, builders: Record<string, TslBuild> = tslBuilders, options: CompileOptions = {}): CompileResult {
    const time = uniform(0);
    const lookup = options.textures ?? graphTextures(graph);

    const backend: WalkBackend<TslValue> = {
        capabilities: options.particle ? TSL_PARTICLE_CAPABILITIES : TSL_CAPABILITIES,
        targetName: 'TSL',
        constant,
        uv: () => uv(),
        cast,
        unsupported: (def) => (builders[def.id] ? null : `Node "${def.id}" has no TSL implementation`),
        build: (node, def, inputs) =>
            builders[def.id]!(inputs, {
                time,
                particle: options.particle,
                params: node.params ?? {},
                texture(name) {
                    const t = lookup(name);
                    if (!t) throw new Error(`Texture "${name}" is not in the graph`);
                    return t;
                },
            }),
    };

    const { outputInputs, errors } = walkGraph(graph, registry, backend);
    if (!outputInputs) return { surface: null, errors };
    return { surface: { color: outputInputs.color, opacity: outputInputs.opacity, time }, errors };
}
