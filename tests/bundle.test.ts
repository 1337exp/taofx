import { describe, expect, it } from 'vitest';
import { buildBundle } from '../src/bundle/bundle';
import type { EditorDoc } from '../src/editor/doc';
import { emptyLink, saveProjectDoc, toDataUri } from '../src/editor/projectFile';
import { parse } from '../src/graph/serialize';
import type { Graph } from '../src/graph/types';
import { createDefaultRegistry } from '../src/nodes';
import { defaultSystem, parseParticles } from '../src/particles/serialize';
import { createProject } from '../src/project/project';

const registry = createDefaultRegistry();
const png = toDataUri(Uint8Array.of(137, 80, 78, 71, 1, 2, 3), 'image/png');
const png2 = toDataUri(Uint8Array.of(137, 80, 78, 71, 4, 5, 6), 'image/png');

function graph(textures: Graph['textures'], names: string[] = Object.keys(textures ?? {})): Graph {
    const nodes: Graph['nodes'] = { out: { id: 'out', type: 'output/surface', x: 300, y: 0, values: {} } };
    const connections: Graph['connections'] = [];
    names.forEach((name, i) => {
        nodes[`t${i}`] = { id: `t${i}`, type: 'input/texture', x: 0, y: i * 100, values: {}, params: { texture: name } };
    });
    if (names.length) connections.push({ id: 'c', from: { node: 't0', pin: 'color' }, to: { node: 'out', pin: 'color' } });
    return { nodes, connections, ...(textures ? { textures } : {}) };
}

function projectWith(doc: EditorDoc, hint = 'boom') {
    const project = createProject();
    const link = saveProjectDoc(project, doc, undefined, emptyLink(), hint);
    return { project, id: link.docId! };
}

describe('пакет для игры', () => {
    it('эффект: файл частиц в формате рантайма и картинка рядом, путь от файла эффекта', () => {
        const { project, id } = projectWith({ graph: graph({ sheet: { src: png } }), system: defaultSystem() });
        const bundle = buildBundle(project, id)!;
        expect(bundle).toMatchObject({ name: 'boom', entry: 'boom.json', problems: [] });
        expect(bundle.files.map((f) => f.path)).toEqual(['boom.json', 'textures/sheet.png']);
        expect([...bundle.files[1]!.data]).toEqual([137, 80, 78, 71, 1, 2, 3]);

        const parsed = parseParticles(new TextDecoder().decode(bundle.files[0]!.data), registry);
        expect(parsed.ok).toBe(true);
        if (parsed.ok) {
            expect(parsed.file.material.textures).toEqual({ sheet: { src: 'textures/sheet.png' } });
            expect(parsed.file.system.seed).toBe(defaultSystem().seed);
        }
    });

    it('материал: файл формата taofx', () => {
        const { project, id } = projectWith({ graph: graph({ sheet: { src: png } }), system: null }, 'wall');
        const bundle = buildBundle(project, id)!;
        expect(bundle.entry).toBe('wall.json');
        const parsed = parse(new TextDecoder().decode(bundle.files[0]!.data), registry);
        expect(parsed.ok && parsed.graph.textures).toEqual({ sheet: { src: 'textures/sheet.png' } });
    });

    it('одна картинка у двух текстур кладётся в пакет один раз; разные получают свои пути', () => {
        const { project, id } = projectWith({ graph: graph({ a: { src: png }, b: { src: png }, c: { src: png2 } }), system: null });
        const paths = buildBundle(project, id)!.files.map((f) => f.path);
        expect(paths[0]).toBe('boom.json');
        expect(new Set(paths).size).toBe(paths.length);
        expect(paths.filter((p) => p.startsWith('textures/'))).toHaveLength(project.resources.filter((r) => r.kind === 'image').length);
    });

    it('внешний адрес остаётся как есть и в пакет не кладётся', () => {
        const { project, id } = projectWith({ graph: graph({ remote: { src: 'https://cdn.example/a.png' } }), system: null });
        const bundle = buildBundle(project, id)!;
        expect(bundle.files.map((f) => f.path)).toEqual(['boom.json']);
        expect(JSON.parse(new TextDecoder().decode(bundle.files[0]!.data)).graph.textures).toEqual({ remote: { src: 'https://cdn.example/a.png' } });
    });

    it('картинка пропала из проекта: текстура убрана из пакета, замечание называет её', () => {
        const { project, id } = projectWith({ graph: graph({ sheet: { src: png } }), system: null });
        const image = project.resources.find((r) => r.kind === 'image')!;
        project.remove(image.id, { force: true });
        const bundle = buildBundle(project, id)!;
        expect(bundle.problems).toEqual([{ code: 'missingAsset', detail: 'sheet' }]);
        expect(bundle.files.map((f) => f.path)).toEqual(['boom.json']);
        expect(JSON.parse(new TextDecoder().decode(bundle.files[0]!.data)).graph.textures).toBeUndefined();
    });

    it('документ проекта в пакет не попадает: тело записано без служебных полей (вид камеры, ссылки по id)', () => {
        const { project, id } = projectWith({ graph: graph({ sheet: { src: png } }), system: defaultSystem() });
        const text = new TextDecoder().decode(buildBundle(project, id)!.files[0]!.data);
        expect(text).not.toContain('"asset"');
        expect(text).not.toContain('"view"');
        expect(JSON.parse(text)).toMatchObject({ format: 'taofx-particles', version: 1 });
    });

    it('компактная запись по просьбе, по умолчанию с отступами', () => {
        const { project, id } = projectWith({ graph: graph(undefined), system: null });
        expect(new TextDecoder().decode(buildBundle(project, id)!.files[0]!.data)).toContain('\n');
        expect(new TextDecoder().decode(buildBundle(project, id, { pretty: false })!.files[0]!.data)).not.toContain('\n');
    });

    it('имя пакета из файла: без папки и расширения', () => {
        const { project, id } = projectWith({ graph: graph(undefined), system: null }, 'Мой Взрыв');
        project.move(id, 'materials/Мой Взрыв.mat.json');
        expect(buildBundle(project, id)!.name).toBe('Мой Взрыв');
    });

    it('не документ эффекта или материала и неизвестный id: undefined', () => {
        const { project, id } = projectWith({ graph: graph({ sheet: { src: png } }), system: null });
        const image = project.resources.find((r) => r.kind === 'image')!;
        const flip = project.addDoc('flip.flip.json', 'flipbook', { image: image.id, frames: [], fps: 12 });
        expect(buildBundle(project, flip.id)).toBeUndefined();
        expect(buildBundle(project, image.id)).toBeUndefined();
        expect(buildBundle(project, 'нет-такого')).toBeUndefined();
        expect(buildBundle(project, id)).toBeDefined();
    });
});
