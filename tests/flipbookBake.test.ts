// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { layout } from '@/editor/layout';
import { useEditor } from '@/editor/store';
import type { ImageLike } from '@/flipbook/types';

// Разбор картинки в пиксели нужен браузеру (холст), здесь он подменён: картинка 8×4, левая половина красная, правая зелёная.
const { pixels } = vi.hoisted(() => ({ pixels: { current: null as ImageLike | null } }));
vi.mock('@/editor/flipbookImage', () => ({ imagePixels: async () => pixels.current }));

import { bakeFlipbook } from '@/editor/flipbookBake';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4EIwESMolGFxCoEAD8UAhGjZ3vQAAAAAElFTkSuQmCC'), (c) => c.charCodeAt(0));
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

function sheetImage(): ImageLike {
    const data = new Uint8ClampedArray(8 * 4 * 4);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) data.set(x < 4 ? [255, 0, 0, 255] : [0, 255, 0, 255], (y * 8 + x) * 4);
    return { width: 8, height: 4, data };
}

beforeEach(() => {
    localStorage.clear();
    layout.view = 'preview';
    pixels.current = sheetImage();
    setActivePinia(createPinia());
});

async function setup() {
    const editor = useEditor();
    const mat = editor.createDocument('material')!;
    await editor.importFiles([new File([PNG as BlobPart], 'boom.png')]);
    const image = editor.project.resources.find((r) => r.kind === 'image')!.id;
    const frames = [
        { x: 0, y: 0, w: 4, h: 4 },
        { x: 4, y: 0, w: 4, h: 4 },
    ];
    const flip = editor.createFlipbook({ image, frames })!;
    return { editor, mat, image, flip };
}

const sheetOf = (editor: ReturnType<typeof useEditor>, flip: string) => editor.flipbookBody(flip)!.sheet;

describe('запекание флипбука в картинку проекта', () => {
    it('лист кладётся в textures/имя.sheet.png, флипбук запоминает его id и ссылается на него', async () => {
        const { editor, image, flip } = await setup();
        const id = await bakeFlipbook(flip);
        expect(id).not.toBeNull();
        const sheet = editor.project.find(id!)!;
        expect(sheet).toMatchObject({ kind: 'image', path: 'textures/boom.sheet.png' });
        expect([...editor.project.files.read(sheet.path)!.subarray(0, 8)]).toEqual(SIGNATURE);
        expect(sheetOf(editor, flip)).toBe(id);
        expect([...editor.project.find(flip)!.refs].sort()).toEqual([image, id!].sort());
        expect(editor.referrersOf(id!).map((r) => r.id)).toEqual([flip]);
    });

    it('повторное запекание: тот же id и файл; изменение фона переписывает байты под тем же id', async () => {
        const { editor, flip } = await setup();
        const id = (await bakeFlipbook(flip))!;
        const before = editor.project.files.read(editor.project.find(id)!.path)!;
        expect(await bakeFlipbook(flip)).toBe(id);
        expect(editor.project.files.read(editor.project.find(id)!.path)).toBe(before); // байты не тронуты

        editor.updateFlipbook(flip, { key: { color: [255, 0, 0], low: 6, high: 34 } });
        expect(await bakeFlipbook(flip)).toBe(id);
        const after = editor.project.files.read(editor.project.find(id)!.path)!;
        expect(after).not.toBe(before);
        expect(editor.project.resources.filter((r) => r.kind === 'image')).toHaveLength(2); // картинка и лист, копий нет
    });

    it('нет картинки, кадров или пикселей: ничего не создаётся', async () => {
        const { editor, flip } = await setup();
        editor.updateFlipbook(flip, { frames: [] });
        expect(await bakeFlipbook(flip)).toBeNull();
        editor.undo();
        pixels.current = null; // картинку не разобрать
        expect(await bakeFlipbook(flip)).toBeNull();
        pixels.current = sheetImage();
        expect(await bakeFlipbook('нет-такого')).toBeNull();
        expect(editor.project.resources.filter((r) => r.kind === 'image')).toHaveLength(1);
        const empty = editor.createFlipbook()!;
        expect(await bakeFlipbook(empty)).toBeNull();
    });

    it('два запекания подряд: пишет последнее, устаревшее ничего не пишет', async () => {
        const { editor, flip } = await setup();
        const [first, second] = await Promise.all([bakeFlipbook(flip), bakeFlipbook(flip)]);
        expect(first).toBeNull();
        expect(second).not.toBeNull();
        expect(editor.project.resources.filter((r) => r.kind === 'image')).toHaveLength(2);
    });

    it('лист не входит в историю правок: отмена не теряет его, запекание не закрепляет вкладку и не создаёт запись', async () => {
        const { editor, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(flip, true);
        const id = (await bakeFlipbook(flip))!;
        expect(editor.tabs.find((t) => t.docId === flip)!.preview).toBe(true);
        expect(editor.canUndo).toBe(false);

        editor.updateFlipbook(flip, { fps: 30 });
        editor.undo();
        expect(editor.flipbookBody(flip)).toMatchObject({ fps: 12, sheet: id });
        editor.redo();
        expect(editor.flipbookBody(flip)).toMatchObject({ fps: 30, sheet: id });
    });

    it('повторное запекание обновляет подключённую к открытому материалу текстуру', async () => {
        const { editor, mat, flip } = await setup();
        const id = (await bakeFlipbook(flip))!;
        editor.openDocument(mat);
        editor.graph.nodes.tex = { id: 'tex', type: 'input/texture', x: 0, y: 300, values: {}, params: { texture: '' } };
        editor.useProjectImage('tex', 'texture', id);
        const before = editor.graph.textures!['boom.sheet']!.src;
        editor.openDocument(flip);
        editor.updateFlipbook(flip, { key: { color: [255, 0, 0], low: 6, high: 34 } });
        await bakeFlipbook(flip);
        expect(editor.graph.textures!['boom.sheet']!.src).not.toBe(before);
    });

    it('в поле листа лежит не картинка: запекание заводит новый лист и не трогает чужой документ', async () => {
        const { editor, mat, flip } = await setup();
        editor.setFlipbookSheet(flip, mat);
        const id = (await bakeFlipbook(flip))!;
        expect(id).not.toBe(mat);
        expect(editor.project.find(mat)!.kind).toBe('material');
        expect(editor.project.find(id)!.kind).toBe('image');
    });

    it('флипбук удалили, пока шло запекание: ничего не записывается', async () => {
        const { editor, flip } = await setup();
        const baking = bakeFlipbook(flip);
        editor.deleteResource(flip, true);
        expect(await baking).toBeNull();
        expect(editor.project.resources.filter((r) => r.kind === 'image')).toHaveLength(1);
    });

    it('удаление флипбука уносит и его лист, если на лист никто не ссылается', async () => {
        const { editor, flip } = await setup();
        const id = (await bakeFlipbook(flip))!;
        editor.deleteResource(flip, true);
        expect(editor.project.find(id)).toBeUndefined();
        expect(editor.project.resources.filter((r) => r.kind === 'image')).toHaveLength(1);
    });

    it('лист, который взял материал, остаётся после удаления флипбука', async () => {
        const { editor, mat, flip } = await setup();
        const id = (await bakeFlipbook(flip))!;
        editor.openDocument(mat);
        editor.graph.nodes.tex = { id: 'tex', type: 'input/texture', x: 0, y: 300, values: {}, params: { texture: '' } };
        expect(editor.useProjectImage('tex', 'texture', id)).toBe('ok');
        editor.syncDocument();
        editor.deleteResource(flip, true);
        expect(editor.project.find(id)).toBeDefined();
    });
});

describe('картинка проекта в ноде графа', () => {
    async function withTexNode() {
        const ctx = await setup();
        ctx.editor.openDocument(ctx.mat);
        ctx.editor.graph.nodes.tex = { id: 'tex', type: 'input/texture', x: 0, y: 300, values: {}, params: { texture: '' } };
        return ctx;
    }

    it('выбор подключает картинку под именем файла без копии: при сохранении тот же ассет', async () => {
        const { editor, mat, image } = await withTexNode();
        expect(editor.useProjectImage('tex', 'texture', image)).toBe('ok');
        expect(editor.graph.nodes.tex!.params).toEqual({ texture: 'boom' });
        expect(editor.graph.textures!.boom!.src).toMatch(/^data:image\/png;base64,/);
        expect(editor.textureAssetOf('boom')).toBe(image);

        editor.syncDocument();
        expect(editor.project.resources.filter((r) => r.kind === 'image')).toHaveLength(1); // копии нет
        expect(editor.project.referrers(image).map((r) => r.id)).toContain(mat); // материал ссылается на картинку по id
    });

    it('та же картинка второй раз берёт то же имя текстуры; другая получает своё, занятое имя получает номер', async () => {
        const { editor, image } = await withTexNode();
        editor.graph.nodes.tex2 = { id: 'tex2', type: 'input/texture', x: 0, y: 400, values: {}, params: { texture: '' } };
        editor.useProjectImage('tex', 'texture', image);
        editor.useProjectImage('tex2', 'texture', image);
        expect(editor.graph.nodes.tex2!.params).toEqual({ texture: 'boom' });
        expect(Object.keys(editor.graph.textures!)).toEqual(['boom']);

        await editor.importFiles([new File([PNG as BlobPart], 'other.png')]);
        const other = editor.project.resources.find((r) => r.path === 'textures/other.png')!.id;
        editor.openDocument(editor.project.resources.find((r) => r.kind === 'material')!.id);
        editor.useProjectImage('tex2', 'texture', other);
        expect(editor.graph.nodes.tex2!.params).toEqual({ texture: 'other' });

        // имя текстуры занято чужой (загруженной в граф) картинкой: номер
        await editor.importFiles([new File([PNG as BlobPart], 'third.png')]);
        const third = editor.project.resources.find((r) => r.path === 'textures/third.png')!.id;
        editor.importTexture('tex', 'texture', 'third.png', 'data:image/png;base64,AAAA');
        editor.useProjectImage('tex', 'texture', third);
        expect(editor.graph.nodes.tex!.params).toEqual({ texture: 'third 2' });
        expect(editor.textureAssetOf('third 2')).toBe(third);
        expect(editor.textureAssetOf('third')).toBeUndefined();
    });

    it('отказы: нет такой картинки, это не картинка, не помещается в граф', async () => {
        const { editor, mat, image } = await withTexNode();
        expect(editor.useProjectImage('tex', 'texture', 'нет-такой')).toBe('missing');
        expect(editor.useProjectImage('tex', 'texture', mat)).toBe('missing'); // документ
        expect(editor.graph.nodes.tex!.params).toEqual({ texture: '' });

        const asset = editor.project.find(image)!;
        editor.project.files.write(asset.path, new Uint8Array(3_100_000).fill(1)); // base64 больше предела файла рантайма
        expect(editor.useProjectImage('tex', 'texture', image)).toBe('tooLarge');
        expect(editor.graph.textures).toEqual({});
        expect(editor.graph.nodes.tex!.params).toEqual({ texture: '' });
    });

    it('выбор откатывается отменой вместе с текстурой графа', async () => {
        const { editor, image } = await withTexNode();
        editor.commit();
        editor.useProjectImage('tex', 'texture', image);
        expect(editor.canUndo).toBe(true);
        editor.undo();
        expect(editor.graph.nodes.tex!.params).toEqual({ texture: '' });
    });

    it('новые байты картинки подхватываются подключённой текстурой, без записи в историю', async () => {
        const { editor, image } = await withTexNode();
        editor.useProjectImage('tex', 'texture', image);
        const before = editor.graph.textures!.boom!.src;
        editor.commit();
        const asset = editor.project.find(image)!;
        editor.project.files.write(asset.path, new Uint8Array([137, 80, 78, 71, 9, 9]));
        const revision = editor.projectRevision;
        editor.refreshTextures();
        expect(editor.graph.textures!.boom!.src).not.toBe(before);
        expect(editor.graph.textures!.boom!.src).toBe('data:image/png;base64,' + btoa(String.fromCharCode(137, 80, 78, 71, 9, 9)));
        expect(editor.projectRevision).toBe(revision + 1);
        editor.refreshTextures(); // повтор без изменений ничего не переписывает
        expect(editor.graph.textures!.boom!.src).toBe('data:image/png;base64,' + btoa(String.fromCharCode(137, 80, 78, 71, 9, 9)));
    });

    it('связь с картинкой, чья текстура пропала из графа, не мешает выбрать её снова', async () => {
        const { editor, image } = await withTexNode();
        editor.useProjectImage('tex', 'texture', image);
        delete editor.graph.textures!.boom; // текстуру убрали, запись о связи осталась
        expect(editor.useProjectImage('tex', 'texture', image)).toBe('ok');
        expect(editor.graph.textures!.boom!.src).toMatch(/^data:image\/png/);
        expect(editor.graph.nodes.tex!.params).toEqual({ texture: 'boom' });
    });

    it('обновление текстур: убранная текстура не оживает, неизменная не переписывается, не поместившаяся в граф не берётся', async () => {
        const { editor, image } = await withTexNode();
        editor.useProjectImage('tex', 'texture', image);
        const asset = editor.project.find(image)!;
        const same = editor.graph.textures!.boom;
        editor.refreshTextures();
        expect(editor.graph.textures!.boom).toBe(same); // байты те же: запись не заменена

        editor.project.files.write(asset.path, new Uint8Array(3_100_000).fill(1)); // больше предела файла рантайма
        editor.refreshTextures();
        expect(editor.graph.textures!.boom).toBe(same);

        editor.project.files.write(asset.path, new Uint8Array([137, 80, 78, 71, 1]));
        delete editor.graph.textures!.boom;
        editor.refreshTextures();
        expect(editor.graph.textures).toEqual({});
    });

    it('картинка, которой больше нет в графе, остаётся в проекте после записи документа', async () => {
        const { editor, image } = await withTexNode();
        editor.useProjectImage('tex', 'texture', image);
        editor.syncDocument();
        delete editor.graph.nodes.tex;
        editor.syncDocument();
        expect(editor.project.find(image)).toBeDefined();
    });
});
