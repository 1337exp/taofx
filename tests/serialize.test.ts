import { describe, expect, it } from 'vitest';
import { DEMO_GRAPH } from '@/demo';
import { FORMAT, VERSION, parse, serialize } from '@/graph/serialize';
import { createDefaultRegistry } from '@/nodes';

const registry = createDefaultRegistry();

const file = (graph: unknown, extra: Record<string, unknown> = {}) => JSON.stringify({ format: FORMAT, version: VERSION, graph, ...extra });
const nodes = { a: { id: 'a', type: 'input/time', x: 0, y: 0, values: {} }, b: { id: 'b', type: 'math/add', x: 10, y: 10, values: { b: 2 } } };

describe('serialize / parse', () => {
    it('круговой проход: демо-граф и камера возвращаются без потерь', () => {
        const text = serialize(DEMO_GRAPH, { x: 5, y: 6, z: 1.5 });
        const result = parse(text, registry);
        expect(result.ok).toBe(true);
        if (!result.ok) return;
        expect(result.graph).toEqual(DEMO_GRAPH);
        expect(result.view).toEqual({ x: 5, y: 6, z: 1.5 });
        expect(result.droppedConnections).toBe(0);
    });

    it('компактный и читаемый вывод описывают один и тот же граф', () => {
        const compact = serialize(DEMO_GRAPH, undefined, false);
        expect(compact).not.toContain('\n');
        expect(serialize(DEMO_GRAPH, undefined, true)).toContain('\n');
        expect(parse(compact, registry)).toMatchObject({ ok: true });
    });
});

describe('parse: отказ файла целиком', () => {
    const code = (text: string) => {
        const r = parse(text, registry);
        return r.ok ? 'ok' : r.error.code;
    };

    it('не JSON, чужой JSON, более новая версия', () => {
        expect(code('{oops')).toBe('invalidJson');
        expect(code('{"format":"other"}')).toBe('notTaofxFile');
        expect(code('[]')).toBe('notTaofxFile');
        expect(code(JSON.stringify({ format: FORMAT, version: VERSION + 1, graph: {} }))).toBe('newerVersion');
        expect(code(JSON.stringify({ format: FORMAT, version: 0, graph: {} }))).toBe('invalidStructure');
    });

    it('повреждённая структура', () => {
        expect(code(file(null))).toBe('invalidStructure');
        expect(code(file({ nodes: {}, connections: 'x' }))).toBe('invalidStructure');
        expect(code(file({ nodes: { a: { id: 'b', type: 'input/time', x: 0, y: 0 } }, connections: [] }))).toBe('invalidStructure'); // id не совпал с ключом
        expect(code(file({ nodes: { a: { id: 'a', type: 'input/time', x: 'zero', y: 0 } }, connections: [] }))).toBe('invalidStructure');
        expect(code(file({ nodes: { a: { id: 'a', type: 'math/add', x: 0, y: 0, values: { b: 'two' } } }, connections: [] }))).toBe('invalidStructure');
        expect(code(file({ nodes: { a: { id: 'a', type: 'math/add', x: 0, y: 0, values: { b: [1, 2, 3, 4, 5] } } }, connections: [] }))).toBe('invalidStructure');
    });

    it('опасные id отклоняются', () => {
        const evil = JSON.parse('{"__proto__": {"id": "__proto__", "type": "input/time", "x": 0, "y": 0}}');
        expect(code(file({ nodes: evil, connections: [] }))).toBe('invalidStructure');
        expect(code(file({ nodes, connections: [{ id: '__proto__', from: { node: 'a', pin: 't' }, to: { node: 'b', pin: 'a' } }] }))).toBe('invalidStructure');
    });

    it('неизвестный тип ноды называется в detail', () => {
        const r = parse(file({ nodes: { a: { id: 'a', type: 'nope/nothing', x: 0, y: 0, values: {} } }, connections: [] }), registry);
        expect(r).toEqual({ ok: false, error: { code: 'unknownNode', detail: 'nope/nothing' } });
    });

    it('повторяющийся id связи', () => {
        const c = { id: 'c1', from: { node: 'a', pin: 't' }, to: { node: 'b', pin: 'a' } };
        expect(code(file({ nodes, connections: [c, c] }))).toBe('invalidStructure');
    });
});

describe('parse: недопустимые связи отбрасываются, граф остаётся', () => {
    it('несуществующий пин, цикл, лишняя связь в тот же вход', () => {
        const link = (id: string, f: [string, string], t: [string, string]) => ({ id, from: { node: f[0], pin: f[1] }, to: { node: t[0], pin: t[1] } });
        const text = file({
            nodes: { ...nodes, c: { id: 'c', type: 'math/multiply', x: 0, y: 0, values: {} } },
            connections: [
                link('ok', ['a', 't'], ['b', 'a']),
                link('ghost', ['a', 'zzz'], ['b', 'b']), // нет такого выхода
                link('dup', ['a', 't'], ['b', 'a']), // второй раз в тот же вход
                link('back', ['b', 'result'], ['c', 'a']),
                link('loop', ['c', 'result'], ['b', 'b']), // c → b, а b → c уже есть: цикл
            ],
        });
        const r = parse(text, registry);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.graph.connections.map((c) => c.id)).toEqual(['ok', 'back', 'loop'].filter((id) => id !== 'loop'));
        expect(r.droppedConnections).toBe(3);
    });

    it('битая камера игнорируется, а не валит загрузку', () => {
        const r = parse(file({ nodes, connections: [] }, { view: { x: 1, y: 2, z: -1 } }), registry);
        expect(r).toMatchObject({ ok: true, view: undefined });
    });
});

describe('текстуры и параметры в файле', () => {
    const base = (graph: unknown) => JSON.stringify({ format: 'taofx', version: 1, graph });
    const registry = createDefaultRegistry();
    const tex = { smoke: { src: 'data:image/png;base64,AAAA' } };
    const node = { id: 't', type: 'input/texture', x: 0, y: 0, values: {}, params: { texture: 'smoke' } };

    it('круг: параметры ноды и текстуры графа сохраняются и читаются', () => {
        const text = base({ nodes: { t: node }, connections: [], textures: tex });
        const r = parse(text, registry);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.graph.nodes.t!.params).toEqual({ texture: 'smoke' });
        expect(r.graph.textures).toEqual(tex);
        expect(JSON.parse(serialize(r.graph)).graph.textures).toEqual(tex);
    });

    it('без текстур поля нет, мусор отклоняется', () => {
        const ok = parse(base({ nodes: {}, connections: [] }), registry);
        expect(ok.ok && ok.graph.textures).toBeFalsy();

        for (const textures of [[], { a: 5 }, { a: { src: '' } }, { a: { src: 'x'.repeat(4_000_001) } }]) {
            const r = parse(base({ nodes: {}, connections: [], textures }), registry);
            expect(r.ok, JSON.stringify(textures).slice(0, 40)).toBe(false);
        }
        expect(parse(base({ nodes: { t: { ...node, params: { texture: 5 } } }, connections: [] }), registry).ok).toBe(false);
        expect(parse(base({ nodes: { t: { ...node, params: [] } }, connections: [] }), registry).ok).toBe(false);
    });
});
