import { describe, expect, it } from 'vitest';
import { emptyDoc, parseDoc, serializeDoc, type EditorDoc } from '../src/editor/doc';
import { emptyLink, fromDataUri, loadProjectDoc, saveProjectDoc, toDataUri, type ProjectLink } from '../src/editor/projectFile';
import type { Graph } from '../src/graph/types';
import { createDefaultRegistry } from '../src/nodes';
import { defaultSystem } from '../src/particles/serialize';
import { packProject, unpackProject } from '../src/project/archive';
import { createProject } from '../src/project/project';

const registry = createDefaultRegistry();
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const png = `data:image/png;base64,${PNG_B64}`;
const png2 = toDataUri(Uint8Array.of(137, 80, 78, 71, 1, 2, 3), 'image/png');
const jpeg = toDataUri(Uint8Array.of(255, 216, 255, 224, 9, 9), 'image/jpeg');

/** Материал: картинка по uv в цвет поверхности. `textures` задаёт тест. */
function materialGraph(textures: Graph['textures'], texture = 'sheet'): Graph {
    return {
        nodes: {
            t: { id: 't', type: 'input/texture', x: 0, y: 0, values: {}, params: { texture } },
            out: { id: 'out', type: 'output/surface', x: 300, y: 0, values: {} },
        },
        connections: [{ id: 'c1', from: { node: 't', pin: 'color' }, to: { node: 'out', pin: 'color' } }],
        ...(textures ? { textures } : {}),
    };
}

const doc = (textures: Graph['textures'], system = false): EditorDoc => ({ graph: materialGraph(textures), system: system ? defaultSystem() : null });
const view = { x: 10, y: -20, z: 1.5 };
const loaded = (project: ReturnType<typeof createProject>) => {
    const r = loadProjectDoc(project, registry);
    if (!r.ok) throw new Error(JSON.stringify(r.error));
    return r.loaded;
};

describe('toDataUri и fromDataUri', () => {
    it('круг: байты и расширение', () => {
        const bytes = Uint8Array.from({ length: 70_000 }, (_, i) => (i * 7) & 255); // больше одного куска перекодирования
        const back = fromDataUri(toDataUri(bytes, 'image/webp'));
        expect(back?.ext).toBe('.webp');
        expect([...back!.bytes]).toEqual([...bytes]);
    });

    it('не наш вид адреса не трогается', () => {
        expect(fromDataUri('https://example.com/a.png')).toBeNull();
        expect(fromDataUri('data:image/svg+xml;base64,PHN2Zz4=')).toBeNull();
        expect(fromDataUri('data:image/png,abc')).toBeNull();
        expect(fromDataUri('data:image/png;base64,!!!')).toBeNull();
    });
});

describe('сохранение документа в проект', () => {
    it('картинка из data: становится ассетом, а в документе остаётся ссылка', () => {
        const p = createProject({ name: 'Мой взрыв' });
        const link = saveProjectDoc(p, doc({ sheet: { src: png } }), view, emptyLink(), p.manifest.name);

        expect(p.resources.map((r) => `${r.kind}:${r.path}`).sort()).toEqual(['image:textures/sheet.png', 'material:materials/мой-взрыв.mat.json']);
        const asset = p.find(link.textureAssets.sheet!)!;
        expect(fromDataUri(png)!.bytes).toEqual(p.files.read(asset.path));
        expect(p.problems).toEqual([]);

        const text = p.files.text('materials/мой-взрыв.mat.json')!;
        expect(text).not.toContain('data:image');
        expect(p.readDoc(link.docId!)!.body).toMatchObject({ view, graph: { textures: { sheet: { asset: asset.id } } } });
        expect(p.referrers(asset.id).map((r) => r.id)).toEqual([link.docId]);
    });

    it('круг «сохранить, упаковать, открыть» возвращает тот же документ, вид и связь', async () => {
        const original = doc({ sheet: { src: png } }, true);
        const p = createProject({ name: 'x' });
        const link = saveProjectDoc(p, original, view, emptyLink());

        const r = await unpackProject(await packProject(p));
        if (!r.ok) throw new Error(r.error);
        const back = loaded(r.project);

        const normal = parseDoc(serializeDoc(original, view, false), registry); // так документ читается из обычного файла
        if (!normal.ok) throw new Error('исходный документ не разобрался');
        expect(back.doc).toEqual(normal.doc);
        expect(back.doc.graph.textures).toEqual({ sheet: { src: png } });
        expect(back.doc.system).toEqual(original.system);
        expect(back.view).toEqual(view);
        expect(back.link).toEqual(link);
        expect(back.dropped).toBe(0);
        expect(back.missingAssets).toBe(0);
    });

    it('повторное сохранение того же не трогает ассет и сохраняет id', () => {
        const p = createProject();
        const link = saveProjectDoc(p, doc({ sheet: { src: png } }), view, emptyLink());
        const writes: string[] = [];
        p.files.subscribe((c) => writes.push(`${c.kind}:${c.path}`));

        const again = saveProjectDoc(p, doc({ sheet: { src: png } }), view, link);
        expect(again).toEqual(link);
        expect(writes.filter((w) => w.includes('textures/'))).toEqual([]);
        expect(p.resources).toHaveLength(2);
    });

    it('другая картинка под тем же именем: тот же id, файл переписан', () => {
        const p = createProject();
        const link = saveProjectDoc(p, doc({ sheet: { src: png } }), view, emptyLink());
        const again = saveProjectDoc(p, doc({ sheet: { src: png2 } }), view, link);
        expect(again.textureAssets.sheet).toBe(link.textureAssets.sheet);
        expect([...p.files.read('textures/sheet.png')!]).toEqual([137, 80, 78, 71, 1, 2, 3]);
    });

    it('картинка сменила формат: новый файл с другим расширением, старый удалён', () => {
        const p = createProject();
        const link = saveProjectDoc(p, doc({ sheet: { src: png } }), view, emptyLink());
        const again = saveProjectDoc(p, doc({ sheet: { src: jpeg } }), view, link);
        expect(p.files.has('textures/sheet.png')).toBe(false);
        expect(p.files.has('textures/sheet.png.meta.json')).toBe(false);
        expect(p.find(again.textureAssets.sheet!)?.path).toBe('textures/sheet.jpg');
        expect(p.problems).toEqual([]);
    });

    it('картинка, которой больше нет в графе, остаётся в проекте: файлы пользователя молча не удаляются', () => {
        const p = createProject();
        const link = saveProjectDoc(p, doc({ sheet: { src: png } }), view, emptyLink());
        const asset = link.textureAssets.sheet!;
        const again = saveProjectDoc(p, { graph: { ...materialGraph(undefined), nodes: { out: materialGraph(undefined).nodes.out! }, connections: [] }, system: null }, view, link);
        expect(again.textureAssets).toEqual({});
        expect(p.resources.map((r) => r.kind).sort()).toEqual(['image', 'material']);
        expect(p.find(asset)).toBeDefined();
    });

    it('картинка, на которую не ссылается ни одна нода, в проект не попадает', () => {
        const p = createProject();
        saveProjectDoc(p, doc({ sheet: { src: png }, unused: { src: png2 } }), view, emptyLink());
        expect(p.resources.filter((r) => r.kind === 'image')).toHaveLength(1);
    });

    it('внешний адрес и чужой вид data: остаются в графе, ассета нет', () => {
        const p = createProject();
        const link = saveProjectDoc(p, doc({ sheet: { src: 'https://example.com/a.png' } }), view, emptyLink());
        expect(p.resources.map((r) => r.kind)).toEqual(['material']);
        expect(p.readDoc(link.docId!)!.body.graph).toMatchObject({ textures: { sheet: { src: 'https://example.com/a.png' } } });
        expect(loaded(p).doc.graph.textures).toEqual({ sheet: { src: 'https://example.com/a.png' } });
    });

    it('имя текстуры со знаками, запрещёнными в именах файлов, становится безопасным путём', () => {
        const p = createProject();
        saveProjectDoc(p, { graph: materialGraph({ 'a/b:c?': { src: png } }, 'a/b:c?'), system: null }, view, emptyLink());
        expect(p.resources.find((r) => r.kind === 'image')?.path).toBe('textures/a_b_c_.png');
    });

    it('две картинки с совпавшими по файлу именами получают разные файлы', () => {
        const p = createProject();
        const g = materialGraph({ 'a/b': { src: png }, 'a:b': { src: png2 } }, 'a/b');
        g.nodes.t2 = { id: 't2', type: 'input/texture', x: 0, y: 100, values: {}, params: { texture: 'a:b' } };
        saveProjectDoc(p, { graph: g, system: null }, view, emptyLink());
        expect(p.resources.filter((r) => r.kind === 'image').map((r) => r.path).sort()).toEqual(['textures/a_b 2.png', 'textures/a_b.png']);
    });

    it('картинка, которой документ не пользуется, остаётся, если на неё ссылается другой документ', () => {
        const p = createProject();
        const link = saveProjectDoc(p, doc({ sheet: { src: png } }), view, emptyLink());
        const assetId = link.textureAssets.sheet!;
        p.addDoc('materials/other.mat.json', 'material', { graph: { ...materialGraph(undefined), textures: { s: { asset: assetId } } } });

        saveProjectDoc(p, doc(undefined), view, link); // из нашего документа картинка ушла
        expect(p.find(assetId)).toBeDefined();
        expect(p.dangling()).toEqual([]);
    });

    it('имя текстуры вроде con (зарезервировано на Windows) становится безопасным именем файла', () => {
        const p = createProject();
        saveProjectDoc(p, { graph: materialGraph({ con: { src: png } }, 'con'), system: null }, view, emptyLink());
        expect(p.resources.find((r) => r.kind === 'image')?.path).toBe('textures/texture.png');
    });

    it('чужая запись на месте будущей картинки не затирается: берётся другое имя', () => {
        const p = createProject();
        p.files.write('textures/sheet.png.meta.json', '{}'); // осталась от прежнего файла
        saveProjectDoc(p, doc({ sheet: { src: png } }), view, emptyLink());
        expect(p.resources.find((r) => r.kind === 'image')?.path).toBe('textures/sheet 2.png');
    });

    it('смена вида документа: материал стал эффектом, id тот же, файл переехал', () => {
        const p = createProject({ name: 'Boom' });
        const link = saveProjectDoc(p, doc({ sheet: { src: png } }), view, emptyLink(), 'Boom');
        expect(p.find(link.docId!)?.path).toBe('materials/boom.mat.json');

        const asEffect = saveProjectDoc(p, doc({ sheet: { src: png } }, true), view, link, 'Boom');
        expect(asEffect.docId).toBe(link.docId);
        expect(p.find(asEffect.docId!)).toMatchObject({ kind: 'effect', path: 'effects/boom.fx.json' });
        expect(p.files.has('materials/boom.mat.json')).toBe(false);
        expect(p.resources.filter((r) => r.type === 'doc')).toHaveLength(1);
        expect(p.referrers(asEffect.textureAssets.sheet!)).toHaveLength(1);
        expect(loaded(p).doc.system).not.toBeNull();

        const back = saveProjectDoc(p, doc({ sheet: { src: png } }), view, asEffect, 'Boom');
        expect(p.find(back.docId!)).toMatchObject({ kind: 'material', path: 'materials/boom.mat.json' });
    });

    it('документ в своей папке не переезжает в стандартную при смене вида', () => {
        const p = createProject();
        const first = saveProjectDoc(p, doc(undefined), view, emptyLink());
        p.move(first.docId!, 'мои/boom.mat.json');
        const second = saveProjectDoc(p, doc(undefined, true), view, first);
        expect(p.find(second.docId!)?.path).toBe('мои/boom.fx.json');
    });

    it('пустое или негодное имя проекта даёт имя по виду документа', () => {
        const p = createProject();
        saveProjectDoc(p, doc(undefined), view, emptyLink(), '  ');
        expect(p.resources[0]?.path).toBe('materials/material.mat.json');
        const q = createProject();
        saveProjectDoc(q, doc(undefined, true), view, emptyLink(), 'con');
        expect(q.resources[0]?.path).toBe('effects/effect.fx.json');
    });
});

describe('открытие документа из проекта', () => {
    it('проект без документов открывается пустым документом', () => {
        const l = loaded(createProject());
        expect(l.doc).toEqual(emptyDoc());
        expect(l.link).toEqual(emptyLink());
    });

    it('если есть эффект и материал, открывается эффект (даже если материал по пути раньше)', () => {
        const p = createProject();
        p.addDoc('a/первый.mat.json', 'material', { graph: materialGraph(undefined) });
        p.addDoc('z/последний.fx.json', 'effect', { system: defaultSystem(), graph: materialGraph(undefined) });
        expect(loaded(p).doc.system).not.toBeNull();
    });

    it('ассета нет: картинка убирается из графа и считается', () => {
        const p = createProject();
        const link = saveProjectDoc(p, doc({ sheet: { src: png } }), view, emptyLink());
        p.files.delete(p.find(link.textureAssets.sheet!)!.path);
        const l = loaded(p);
        expect(l.missingAssets).toBe(1);
        expect(l.doc.graph.textures ?? {}).toEqual({});
        expect(l.link.textureAssets).toEqual({});
    });

    it('файл, который редактор не разберёт, даёт ошибку, а не падение', () => {
        const p = createProject();
        const l = p.addDoc('materials/x.mat.json', 'material', { graph: { nodes: { a: { id: 'a', type: 'нет/такой', x: 0, y: 0, values: {} } }, connections: [] } });
        expect(l.kind).toBe('material');
        const r = loadProjectDoc(p, registry);
        expect(r.ok).toBe(false);
    });

    it('связь запоминает имя текстуры и ассет, чтобы следующее сохранение не плодило копии', () => {
        const p = createProject();
        const first = saveProjectDoc(p, doc({ sheet: { src: png } }), view, emptyLink());
        const reopened: ProjectLink = loaded(p).link;
        const second = saveProjectDoc(p, doc({ sheet: { src: png } }), view, reopened);
        expect(second).toEqual(first);
        expect(p.resources.filter((r) => r.kind === 'image')).toHaveLength(1);
    });
});
