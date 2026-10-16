import { describe, expect, it } from 'vitest';
import { addNode, canConnect, connect, createGraph, disconnect, findCompatiblePin, removeNode } from '@/graph/ops';
import { createDefaultRegistry } from '@/nodes';

const registry = createDefaultRegistry();
const ref = (node: string, pin: string) => ({ node, pin });

function sample() {
    const g = createGraph();
    addNode(g, registry, 'input/uv', { id: 'uv' });
    addNode(g, registry, 'input/time', { id: 'time' });
    addNode(g, registry, 'math/add', { id: 'add' });
    addNode(g, registry, 'math/multiply', { id: 'mul' });
    addNode(g, registry, 'noise/perlin', { id: 'noise' });
    addNode(g, registry, 'const/color', { id: 'color' });
    addNode(g, registry, 'output/surface', { id: 'out' });
    return g;
}

describe('addNode / removeNode', () => {
    it('создаёт ноду с уникальным id и значениями, неизвестный тип отклоняет', () => {
        const g = createGraph();
        const a = addNode(g, registry, 'math/add', { x: 5, values: { b: 2 } });
        const b = addNode(g, registry, 'math/add');
        expect(a.id).not.toBe(b.id);
        expect(a).toMatchObject({ type: 'math/add', x: 5, y: 0, values: { b: 2 } });
        expect(() => addNode(g, registry, 'nope/nothing')).toThrow(/Unknown/);
        expect(() => addNode(g, registry, 'math/add', { id: a.id })).toThrow(/already exists/);
    });

    it('удаление ноды убирает и её связи', () => {
        const g = sample();
        connect(g, registry, ref('uv', 'uv'), ref('mul', 'a'));
        connect(g, registry, ref('mul', 'result'), ref('add', 'a'));
        removeNode(g, 'mul');
        expect(g.nodes.mul).toBeUndefined();
        expect(g.connections).toEqual([]);
    });
});

describe('canConnect', () => {
    it('float → любой вход и vec3 ↔ color можно, сужение нельзя', () => {
        const g = sample();
        expect(canConnect(g, registry, ref('time', 't'), ref('out', 'color')).ok).toBe(true); // float → color (растягивается)
        expect(canConnect(g, registry, ref('color', 'color'), ref('out', 'color')).ok).toBe(true);
        expect(canConnect(g, registry, ref('color', 'color'), ref('out', 'opacity'))).toEqual({ ok: false, reason: 'incompatible' });
        expect(canConnect(g, registry, ref('uv', 'uv'), ref('out', 'color'))).toEqual({ ok: false, reason: 'incompatible' }); // vec2 → vec3
    });

    it('отклоняет несуществующее, ноду саму в себя и неверные пины', () => {
        const g = sample();
        expect(canConnect(g, registry, ref('nope', 'x'), ref('add', 'a'))).toEqual({ ok: false, reason: 'missingNode' });
        expect(canConnect(g, registry, ref('add', 'result'), ref('add', 'a'))).toEqual({ ok: false, reason: 'sameNode' });
        expect(canConnect(g, registry, ref('uv', 'zzz'), ref('add', 'a'))).toEqual({ ok: false, reason: 'noOutput' });
        expect(canConnect(g, registry, ref('uv', 'uv'), ref('add', 'zzz'))).toEqual({ ok: false, reason: 'noInput' });
    });

    it('находит цикл', () => {
        const g = sample();
        connect(g, registry, ref('add', 'result'), ref('mul', 'a'));
        expect(canConnect(g, registry, ref('mul', 'result'), ref('add', 'a'))).toEqual({ ok: false, reason: 'cycle' });
    });

    it('не пускает связь, которая расширит gen-ноду и сломает то, что за ней', () => {
        const g = sample();
        // add(float) → out.opacity (float): пока всё float, можно
        connect(g, registry, ref('add', 'result'), ref('out', 'opacity'));
        // а теперь vec2 в add расширил бы результат до vec2 и сломал бы opacity (float)
        expect(canConnect(g, registry, ref('uv', 'uv'), ref('add', 'a'))).toEqual({ ok: false, reason: 'incompatible' });
        // float в add безопасно
        expect(canConnect(g, registry, ref('time', 't'), ref('add', 'a')).ok).toBe(true);
    });

    it('не меняет граф', () => {
        const g = sample();
        const before = JSON.stringify(g);
        canConnect(g, registry, ref('time', 't'), ref('add', 'a'));
        expect(JSON.stringify(g)).toBe(before);
    });
});

describe('connect / disconnect', () => {
    it('в вход ведёт одна связь: новая заменяет прежнюю', () => {
        const g = sample();
        connect(g, registry, ref('time', 't'), ref('add', 'a'));
        const second = connect(g, registry, ref('uv', 'uv'), ref('add', 'a'));
        expect(g.connections).toHaveLength(1);
        expect(g.connections[0]).toBe(second);
    });

    it('из выхода можно вести несколько связей', () => {
        const g = sample();
        connect(g, registry, ref('time', 't'), ref('add', 'a'));
        connect(g, registry, ref('time', 't'), ref('mul', 'a'));
        expect(g.connections).toHaveLength(2);
    });

    it('недопустимую связь бросает ошибкой, disconnect убирает связь по id', () => {
        const g = sample();
        expect(() => connect(g, registry, ref('color', 'color'), ref('out', 'opacity'))).toThrow(/incompatible/);
        const c = connect(g, registry, ref('time', 't'), ref('add', 'a'));
        disconnect(g, c.id);
        expect(g.connections).toEqual([]);
    });
});

describe('findCompatiblePin', () => {
    const def = (id: string) => registry.get(id)!;

    it('от выхода ищет вход: точный тип раньше gen, gen раньше прочих совместимых', () => {
        expect(findCompatiblePin({ type: 'color', dir: 'out' }, def('output/surface'))).toBe('color');
        expect(findCompatiblePin({ type: 'float', dir: 'out' }, def('output/surface'))).toBe('opacity'); // exact float
        expect(findCompatiblePin({ type: 'vec2', dir: 'out' }, def('math/add'))).toBe('a'); // gen
        expect(findCompatiblePin({ type: 'vec2', dir: 'out' }, def('output/surface'))).toBeNull(); // vec2 некуда
        expect(findCompatiblePin({ type: 'float', dir: 'out' }, def('input/time'))).toBeNull(); // входов нет
    });

    it('от входа ищет выход, который в него влезает', () => {
        expect(findCompatiblePin({ type: 'float', dir: 'in' }, def('noise/perlin'))).toBe('n');
        expect(findCompatiblePin({ type: 'color', dir: 'in' }, def('const/color'))).toBe('color');
        expect(findCompatiblePin({ type: 'float', dir: 'in' }, def('input/uv'))).toBeNull(); // vec2 в float нельзя
        expect(findCompatiblePin({ type: 'gen', dir: 'in' }, def('input/uv'))).toBe('uv'); // в gen влезает что угодно
        expect(findCompatiblePin({ type: 'float', dir: 'in' }, def('output/surface'))).toBeNull(); // выходов нет
    });
});
