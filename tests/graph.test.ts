import { describe, expect, it } from 'vitest';
import { cast, compile, constant } from '@/graph/compile';
import { canConnect, resolveTypes } from '@/graph/resolve';
import type { Graph } from '@/graph/types';
import { WIDTH } from '@/graph/types';
import { DEMO_GRAPH } from '@/demo';
import { createDefaultRegistry } from '@/nodes';

const registry = createDefaultRegistry();

const graph = (nodes: Graph['nodes'], connections: Graph['connections'] = []): Graph => ({ nodes, connections });
const node = (id: string, type: string, values: Graph['nodes'][string]['values'] = {}) => ({ id, type, x: 0, y: 0, values });
const link = (id: string, from: string, fromPin: string, to: string, toPin: string) => ({
    id,
    from: { node: from, pin: fromPin },
    to: { node: to, pin: toPin },
});

describe('реестр нод', () => {
    it('собирает все ноды из файлов', () => {
        const ids = registry.all().map((d) => d.id);
        expect(ids).toContain('output/surface');
        expect(ids).toContain('math/add');
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('id ноды совпадает с папкой/именем, а значения по умолчанию подходят по размеру', () => {
        for (const def of registry.all()) {
            expect(def.id, def.id).toMatch(/^[a-z]+\/[a-z-]+$/);
            for (const [name, pin] of Object.entries(def.inputs)) {
                if (pin.type === 'gen' || !Array.isArray(pin.default)) continue;
                expect(pin.default.length, `${def.id}.${name}`).toBe(WIDTH[pin.type]);
            }
        }
    });
});

describe('canConnect', () => {
    it('тот же размер и float → любой, остальное нельзя', () => {
        expect(canConnect('vec3', 'color')).toBe(true);
        expect(canConnect('color', 'vec3')).toBe(true);
        expect(canConnect('float', 'vec4')).toBe(true);
        expect(canConnect('vec3', 'vec2')).toBe(false);
        expect(canConnect('vec2', 'vec3')).toBe(false);
        expect(canConnect('vec4', 'gen')).toBe(true);
    });
});

describe('resolveTypes', () => {
    it('gen берёт самый широкий из подключённых типов', () => {
        const g = graph(
            { uv: node('uv', 'input/uv'), t: node('t', 'input/time'), add: node('add', 'math/add') },
            [link('1', 'uv', 'uv', 'add', 'a'), link('2', 't', 't', 'add', 'b')],
        );
        const r = resolveTypes(g, registry);
        expect(r.errors).toEqual([]);
        expect(r.nodes.add!.inputs).toEqual({ a: 'vec2', b: 'vec2' });
        expect(r.nodes.add!.outputs.result).toBe('vec2');
    });

    it('без подключений gen — float, color считается vec3', () => {
        const g = graph({ add: node('add', 'math/add'), c: node('c', 'const/color'), mix: node('mix', 'math/mix') }, [
            link('1', 'c', 'color', 'mix', 'a'),
        ]);
        const r = resolveTypes(g, registry);
        expect(r.nodes.add!.outputs.result).toBe('float');
        expect(r.nodes.mix!.outputs.result).toBe('vec3');
    });

    it('тип распространяется по цепочке', () => {
        const g = graph(
            { uv: node('uv', 'input/uv'), a: node('a', 'math/multiply'), b: node('b', 'math/sin') },
            [link('1', 'uv', 'uv', 'a', 'a'), link('2', 'a', 'result', 'b', 'x')],
        );
        expect(resolveTypes(g, registry).nodes.b!.outputs.result).toBe('vec2');
    });

    it('находит цикл и неизвестную ноду', () => {
        const cyc = graph({ a: node('a', 'math/add'), b: node('b', 'math/add') }, [
            link('1', 'a', 'result', 'b', 'a'),
            link('2', 'b', 'result', 'a', 'a'),
        ]);
        expect(resolveTypes(cyc, registry).errors.map((e) => e.kind)).toContain('cycle');

        const unknown = graph({ x: node('x', 'nope/nothing') });
        expect(resolveTypes(unknown, registry).errors[0]).toMatchObject({ kind: 'unknownNode', nodeId: 'x' });
    });

    it('запрещает сужение vec3 → vec2', () => {
        const g = graph(
            { c: node('c', 'const/color'), n: node('n', 'noise/perlin'), m: node('m', 'math/mix') },
            [link('1', 'c', 'color', 'm', 'a')],
        );
        expect(resolveTypes(g, registry).errors).toEqual([]);

        const bad = graph({ c: node('c', 'const/color'), out: node('out', 'output/surface') }, [link('1', 'c', 'color', 'out', 'opacity')]);
        expect(resolveTypes(bad, registry).errors[0]).toMatchObject({ kind: 'incompatible', nodeId: 'out' });
    });
});

describe('constant и cast', () => {
    it('собирают узлы нужного типа', () => {
        expect(constant('float', 2).isNode).toBe(true);
        expect(constant('vec3', [1, 2, 3]).isNode).toBe(true);
        expect(constant('vec3', 0.5).isNode).toBe(true); // число растягивается на компоненты
        expect(cast(constant('float', 1), 'float', 'vec3').isNode).toBe(true);
    });

    it('сужение до float не допускается', () => {
        expect(() => cast(constant('vec3', 1), 'vec3', 'float')).toThrow(/narrow/);
    });
});

describe('compile', () => {
    it('собирает демо-граф без ошибок', () => {
        const r = compile(DEMO_GRAPH, registry);
        expect(r.errors).toEqual([]);
        expect(r.surface!.color.isNode).toBe(true);
        expect(r.surface!.opacity.isNode).toBe(true);
    });

    it('граф без output — ошибка noOutput', () => {
        const r = compile(graph({ t: node('t', 'input/time') }), registry);
        expect(r.surface).toBeNull();
        expect(r.errors[0]!.kind).toBe('noOutput');
    });

    it('пустой output собирается из значений по умолчанию', () => {
        const r = compile(graph({ out: node('out', 'output/surface', { color: [1, 0, 0], opacity: 0.5 }) }), registry);
        expect(r.errors).toEqual([]);
        expect(r.surface).not.toBeNull();
    });

    it('строит каждую ноду один раз, даже если выход используют несколько входов', () => {
        let calls = 0;
        const counting = createDefaultRegistry();
        const real = counting.get('input/time')!;
        const original = real.build;
        real.build = () => {
            calls++;
            return original({});
        };
        const g = graph(
            { t: node('t', 'input/time'), m: node('m', 'math/multiply'), out: node('out', 'output/surface') },
            [link('1', 't', 't', 'm', 'a'), link('2', 't', 't', 'm', 'b'), link('3', 'm', 'result', 'out', 'opacity')],
        );
        expect(compile(g, counting).errors).toEqual([]);
        expect(calls).toBe(1);
    });

    it('ошибку в build ноды отдаёт в errors с id ноды, а не бросает', () => {
        const broken = createDefaultRegistry();
        broken.get('math/sin')!.build = () => {
            throw new Error('boom');
        };
        const g = graph(
            { s: node('s', 'math/sin'), out: node('out', 'output/surface') },
            [link('1', 's', 'result', 'out', 'opacity')],
        );
        const r = compile(g, broken);
        expect(r.surface).toBeNull();
        expect(r.errors[0]).toMatchObject({ kind: 'build', nodeId: 's', message: 'boom' });
    });
});
