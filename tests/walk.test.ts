import { describe, expect, it } from 'vitest';
import type { Graph } from '@/graph/types';
import { walkGraph, type WalkBackend } from '@/graph/walk';
import { createDefaultRegistry } from '@/nodes';

const registry = createDefaultRegistry();

const node = (id: string, type: string, values: Graph['nodes'][string]['values'] = {}) => ({ id, type, x: 0, y: 0, values });
const link = (id: string, from: string, fromPin: string, to: string, toPin: string) => ({ id, from: { node: from, pin: fromPin }, to: { node: to, pin: toPin } });
const graph = (nodes: Graph['nodes'], connections: Graph['connections'] = []): Graph => ({ nodes, connections });

/** Бэкенд-«протокол»: значение это строка, по которой видно, что и в каком порядке строилось. */
function recorder(overrides: Partial<WalkBackend<string>> = {}) {
    const built: string[] = [];
    const backend: WalkBackend<string> = {
        capabilities: ['normal'],
        targetName: 'test',
        constant: (type, value) => `${type}(${JSON.stringify(value)})`,
        uv: () => 'UV',
        cast: (value, from, to) => `${to}<${from}>(${value})`,
        unsupported: () => null,
        build(n, def, inputs) {
            built.push(n.id);
            return Object.fromEntries(Object.keys(def.outputs).map((pin) => [pin, `${n.id}.${pin}(${Object.values(inputs).join(',')})`]));
        },
        ...overrides,
    };
    return { backend, built };
}

describe('walkGraph', () => {
    it('без ноды-выхода: ошибка noOutput', () => {
        const { backend } = recorder();
        const r = walkGraph(graph({ t: node('t', 'input/time') }), registry, backend);
        expect(r.outputInputs).toBeNull();
        expect(r.errors.map((e) => e.kind)).toEqual(['noOutput']);
    });

    it('строит зависимости раньше потребителей, каждую ноду один раз, лишнее не трогает', () => {
        const { backend, built } = recorder();
        const g = graph(
            { t: node('t', 'input/time'), s: node('s', 'math/sin'), u: node('u', 'math/add'), unused: node('unused', 'input/uv'), out: node('out', 'output/surface') },
            [link('1', 't', 't', 's', 'x'), link('2', 's', 'result', 'u', 'a'), link('3', 's', 'result', 'u', 'b'), link('4', 'u', 'result', 'out', 'color')],
        );
        const r = walkGraph(g, registry, backend);
        expect(r.errors).toEqual([]);
        expect(built).toEqual(['t', 's', 'u']); // sin считается один раз, хотя на него два потребителя
        expect(r.outputInputs!.color).toContain('u.result(');
    });

    it('неподключённый вход: константа по умолчанию; вход с fallback uv берёт uv поверхности', () => {
        const { backend } = recorder();
        const g = graph({ t: node('t', 'input/texture'), out: node('out', 'output/surface') }, [link('1', 't', 'color', 'out', 'color')]);
        g.nodes.t!.params = { texture: 'x' };
        const r = walkGraph(g, registry, backend);
        expect(r.outputInputs!.color).toBe('color<color>(t.color(UV))');
        expect(r.outputInputs!.opacity).toContain('float(');
    });

    it('мешающая возможность цели: ошибка с нодой, ничего не строится', () => {
        const { backend, built } = recorder({ capabilities: [] });
        const g = graph({ f: node('f', 'input/fresnel'), out: node('out', 'output/surface') }, [link('1', 'f', 'f', 'out', 'opacity')]);
        const r = walkGraph(g, registry, backend);
        expect(r.outputInputs).toBeNull();
        expect(r.errors[0]).toMatchObject({ kind: 'unsupported', nodeId: 'f' });
        expect(built).toEqual([]);
    });

    it('упавшая нода даёт одну ошибку, сколько бы потребителей у неё ни было', () => {
        const { backend } = recorder({
            build(n, def) {
                if (n.id === 'boom') throw new Error('broken');
                return Object.fromEntries(Object.keys(def.outputs).map((pin) => [pin, 'ok']));
            },
        });
        const g = graph(
            { boom: node('boom', 'math/sin'), u: node('u', 'math/add'), out: node('out', 'output/surface') },
            [link('1', 'boom', 'result', 'u', 'a'), link('2', 'boom', 'result', 'u', 'b'), link('3', 'u', 'result', 'out', 'opacity')],
        );
        const r = walkGraph(g, registry, backend);
        expect(r.outputInputs).toBeNull();
        expect(r.errors).toHaveLength(1);
        expect(r.errors[0]).toMatchObject({ kind: 'build', nodeId: 'boom', message: 'broken' });
    });

    it('нода без реализации в бэкенде: одна ошибка unsupported', () => {
        const { backend } = recorder({ unsupported: (def) => (def.id === 'math/sin' ? 'no sin here' : null) });
        const g = graph(
            { s: node('s', 'math/sin'), u: node('u', 'math/add'), out: node('out', 'output/surface') },
            [link('1', 's', 'result', 'u', 'a'), link('2', 's', 'result', 'u', 'b'), link('3', 'u', 'result', 'out', 'opacity')],
        );
        const r = walkGraph(g, registry, backend);
        expect(r.errors).toEqual([{ kind: 'unsupported', message: 'no sin here', nodeId: 's' }]);
    });
});
