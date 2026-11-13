import { describe, expect, it } from 'vitest';
import { createKinds, EFFECT, MATERIAL } from '../src/project/kinds';
import { createProject, ProjectError } from '../src/project/project';

const graph = (extra: object = {}) => ({ nodes: {}, connections: [], ...extra });
const ID = 'abcdef1234';

describe('виды material и effect', () => {
    it('материал: форма графа и вида камеры', () => {
        expect(MATERIAL.check({ graph: graph() })).toBeNull();
        expect(MATERIAL.check({ graph: graph(), view: { x: 1, y: 2, z: 3 } })).toBeNull();
        expect(MATERIAL.check({})).toBe('graph');
        expect(MATERIAL.check({ graph: [] })).toBe('graph');
        expect(MATERIAL.check({ graph: { connections: [] } })).toBe('graph.nodes');
        expect(MATERIAL.check({ graph: { nodes: [], connections: [] } })).toBe('graph.nodes');
        expect(MATERIAL.check({ graph: { nodes: {} } })).toBe('graph.connections');
        expect(MATERIAL.check({ graph: graph({ textures: [] }) })).toBe('graph.textures');
        expect(MATERIAL.check({ graph: graph({ textures: { a: {} } }) })).toBe('graph.textures.a');
        expect(MATERIAL.check({ graph: graph({ textures: { a: { asset: ID }, b: { src: 'https://x/y.png' } } }) })).toBeNull();
        expect(MATERIAL.check({ graph: graph(), view: { x: 1, y: 2 } })).toBe('view');
        expect(MATERIAL.check({ graph: graph(), view: { x: 1, y: 2, z: 'a' } })).toBe('view');
        expect(MATERIAL.check({ graph: graph(), view: { x: 'a', y: 2, z: 1 } })).toBe('view');
        expect(MATERIAL.check({ graph: graph(), view: { x: 1, y: 'a', z: 1 } })).toBe('view');
    });

    it('эффект: нужна система, остальное как у материала', () => {
        expect(EFFECT.check({ system: {}, graph: graph() })).toBeNull();
        expect(EFFECT.check({ graph: graph() })).toBe('system');
        expect(EFFECT.check({ system: [], graph: graph() })).toBe('system');
        expect(EFFECT.check({ system: {}, graph: [] })).toBe('graph');
        expect(EFFECT.check({ system: {}, graph: graph(), view: 5 })).toBe('view');
    });

    it('ссылки: только id ассетов; внешние адреса, пустые и чужие строки не ссылки', () => {
        const body = { graph: graph({ textures: { a: { asset: ID }, b: { src: 'https://x/y.png' }, c: { asset: '' }, d: { asset: 'Не id!' }, e: { asset: 'zzzzzz9999' } } }) };
        expect(MATERIAL.refs(body)).toEqual([ID, 'zzzzzz9999']);
        expect(EFFECT.refs(body)).toEqual([ID, 'zzzzzz9999']);
        expect(MATERIAL.refs({})).toEqual([]);
        expect(MATERIAL.refs({ graph: graph() })).toEqual([]);
    });

    it('реестр видов находит их по формату и по имени', () => {
        const kinds = createKinds();
        expect(kinds.byFormat('taofx-material')).toBe(MATERIAL);
        expect(kinds.byFormat('taofx-effect')).toBe(EFFECT);
        expect(kinds.byName('effect')).toBe(EFFECT);
        expect(kinds.byExtension('.PNG')?.kind).toBe('image');
        expect(kinds.byExtension('txt')).toBeUndefined();
        expect(() => createKinds([MATERIAL, MATERIAL])).toThrow();
    });
});

describe('addDoc с заданным id', () => {
    const codeOf = (fn: () => unknown) => {
        try {
            fn();
        } catch (e) {
            return e instanceof ProjectError ? e.code : String(e);
        }
        return 'no error';
    };

    it('документ берёт заданный id; занятый или негодный отклоняется', () => {
        const p = createProject();
        const a = p.addDoc('a.mat.json', 'material', { graph: graph() }, { id: 'myid123456' });
        expect(a.id).toBe('myid123456');
        expect(p.find('myid123456')?.path).toBe('a.mat.json');
        expect(codeOf(() => p.addDoc('b.mat.json', 'material', { graph: graph() }, { id: 'myid123456' }))).toBe('badId');
        expect(codeOf(() => p.addDoc('c.mat.json', 'material', { graph: graph() }, { id: 'Не id' }))).toBe('badId');
        expect(p.files.has('b.mat.json')).toBe(false);
        expect(p.addDoc('d.mat.json', 'material', { graph: graph() }).id).not.toBe('myid123456');
    });
});
