// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { nextTick } from 'vue';
import { layout } from '@/editor/layout';
import { useEditor } from '@/editor/store';

const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4EIwESMolGFxCoEAD8UAhGjZ3vQAAAAAElFTkSuQmCC'), (c) => c.charCodeAt(0));
const FRAMES = [
    { x: 0, y: 0, w: 1, h: 2 },
    { x: 1, y: 0, w: 1, h: 2 },
];
const tabIds = (editor: ReturnType<typeof useEditor>) => editor.tabs.map((t) => `${t.docId}${t.preview ? '*' : ''}`);

beforeEach(() => {
    localStorage.clear();
    layout.view = 'preview';
    setActivePinia(createPinia());
});

/** Проект: эффект, материал, картинка и флипбук на ней. Вкладки закрыты, на экране пустая заготовка. */
async function setup() {
    const editor = useEditor();
    const fx = editor.createDocument('effect')!;
    const mat = editor.createDocument('material')!;
    await editor.importFiles([new File([PNG as BlobPart], 'boom.png')]);
    const image = editor.project.resources.find((r) => r.kind === 'image')!.id;
    const flip = editor.createFlipbook({ image, frames: FRAMES })!;
    return { editor, fx, mat, image, flip };
}

describe('флипбук: создание', () => {
    it('файл `flipbooks/имя картинки.flip.json`, тело записано, вкладка закреплена и на экране', async () => {
        const { editor, image, flip } = await setup();
        const resource = editor.project.find(flip)!;
        expect(resource).toMatchObject({ kind: 'flipbook', type: 'doc', path: 'flipbooks/boom.flip.json', refs: [image] });
        expect(editor.project.readDoc(flip)!.body).toMatchObject({ image, frames: FRAMES, fps: 12, detect: { mode: 'grid', cols: 1, rows: 1 }, key: null });
        expect(editor.activeFlipbookId).toBe(flip);
        expect(editor.activeDocId).toBe(flip);
        expect(editor.tabs.find((t) => t.docId === flip)).toMatchObject({ preview: false });
        expect(editor.flipbook).toMatchObject({ image, fps: 12 });
    });

    it('без картинки имя «flipbook», повтор получает номер; чужой id и не картинка отбрасываются', async () => {
        const { editor, fx } = await setup();
        const a = editor.createFlipbook()!;
        const b = editor.createFlipbook({ image: fx })!; // эффект не картинка
        const c = editor.createFlipbook({ image: 'нет-такой' })!;
        expect([a, b, c].map((id) => editor.project.find(id)!.path)).toEqual(['flipbooks/flipbook.flip.json', 'flipbooks/flipbook 2.flip.json', 'flipbooks/flipbook 3.flip.json']);
        for (const id of [a, b, c]) expect(editor.project.readDoc(id)!.body.image).toBe('');
    });

    it('создание не трогает открытый документ сцены: он остаётся в редакторе', async () => {
        const editor = useEditor();
        const fx = editor.createDocument('effect')!;
        editor.updateSystem('seed', (s) => (s.seed = 77));
        editor.createFlipbook();
        expect(editor.openDocId).toBe(fx);
        expect(editor.system!.seed).toBe(77);
        expect(editor.canUndo).toBe(false); // на экране флипбук, у которого своя пустая история
    });

    it('новый флипбук сразу делает проект «не сохранённым»', async () => {
        const editor = useEditor();
        expect(editor.dirty).toBe(false);
        editor.createFlipbook();
        expect(editor.dirty).toBe(true);
    });
});

describe('флипбук: вкладки', () => {
    it('открытие предпросмотром заменяет предпросмотр сцены: живой документ выгружается, а draft не показывается', async () => {
        const { editor, fx, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(fx, true);
        expect(tabIds(editor)).toEqual([`${fx}*`]);
        editor.openDocument(flip, true);
        expect(tabIds(editor)).toEqual([`${flip}*`]);
        expect(editor.openDocId).toBeNull(); // «fx» остался без вкладки, и его в редакторе нет
        expect(editor.draftTab).toBe(false); // пустая заготовка под флипбуком вкладки не просит
        editor.openDocument(fx);
        expect(editor.activeFlipbookId).toBeNull();
        expect(editor.openDocId).toBe(fx);
        expect(editor.activeDocId).toBe(fx);
        expect(editor.draftTab).toBe(false);
    });

    it('закреплённая сцена остаётся под флипбуком как была, переход туда и обратно ничего не теряет', async () => {
        const { editor, fx, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(fx);
        editor.updateSystem('seed', (s) => (s.seed = 4242));
        editor.openDocument(flip);
        expect(editor.openDocId).toBe(fx);
        expect(editor.system!.seed).toBe(4242);
        editor.openDocument(fx);
        expect(editor.canUndo).toBe(true); // история сцены цела
        expect(editor.system!.seed).toBe(4242);
        expect(tabIds(editor)).toEqual([fx, flip]);
    });

    it('открытый флипбук не открывается заново, вкладка не дублируется, закреплённое открытие закрепляет', async () => {
        const { editor, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(flip, true);
        editor.openDocument(flip, true);
        expect(tabIds(editor)).toEqual([`${flip}*`]);
        editor.openDocument(flip);
        expect(tabIds(editor)).toEqual([flip]);
        expect(editor.openDocument('нет-такого')).toBe(false);
    });

    it('разные виды в одном списке вкладок: порядок и предпросмотр общие', async () => {
        const { editor, fx, mat, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(fx);
        editor.openDocument(flip);
        editor.openDocument(mat, true);
        expect(tabIds(editor)).toEqual([fx, flip, `${mat}*`]);
        editor.moveTab(1, 0);
        expect(tabIds(editor)).toEqual([flip, fx, `${mat}*`]);
    });

    it('закрытие флипбука на экране отдаёт экран соседу: живому или другому флипбуку', async () => {
        const { editor, fx, flip } = await setup();
        const other = editor.createFlipbook()!;
        editor.closeAllTabs();
        editor.openDocument(fx);
        editor.openDocument(flip);
        editor.openDocument(other);
        expect(tabIds(editor)).toEqual([fx, flip, other]);
        editor.closeTab(other); // справа никого: слева флипбук
        expect(editor.activeFlipbookId).toBe(flip);
        editor.closeTab(flip); // слева сцена
        expect(editor.activeFlipbookId).toBeNull();
        expect(editor.openDocId).toBe(fx);
        expect(editor.project.find(flip)).toBeDefined(); // закрыта вкладка, не документ
    });

    it('закрытие неактивной вкладки флипбука ничего не меняет на экране', async () => {
        const { editor, fx, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(flip);
        editor.openDocument(fx);
        editor.updateSystem('seed', (s) => (s.seed = 15));
        editor.closeTab(flip);
        expect(editor.openDocId).toBe(fx);
        expect(tabIds(editor)).toEqual([fx]);
        expect(editor.canUndo).toBe(true); // сцена не перезагружалась: её история цела
    });

    it('переход на флипбук записывает правки открытой сцены в проект', async () => {
        const { editor, fx, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(fx);
        editor.updateSystem('seed', (s) => (s.seed = 6161));
        editor.openDocument(flip);
        expect((editor.project.readDoc(fx)!.body.system as { seed: number }).seed).toBe(6161);
    });

    it('закрытие единственной вкладки флипбука: на экране живой документ (пустая заготовка)', async () => {
        const { editor, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(flip);
        editor.closeTab(flip);
        expect(editor.tabs).toEqual([]);
        expect(editor.activeFlipbookId).toBeNull();
        expect(editor.activeDocId).toBeNull();
        expect(editor.draftTab).toBe(true);
    });

    it('закрыта вкладка сцены, пока на экране флипбук: сцена заменяется ближайшей живой, флипбук остаётся на экране', async () => {
        const { editor, fx, mat, flip } = await setup();
        editor.closeAllTabs();
        [fx, mat, flip].forEach((id) => editor.openDocument(id));
        expect(editor.openDocId).toBe(mat);
        editor.closeTab(mat);
        expect(editor.activeFlipbookId).toBe(flip);
        expect(editor.openDocId).toBe(fx);
        expect(tabIds(editor)).toEqual([fx, flip]);
    });

    it('закрыта вкладка сцены, на которую смотрят, а правее флипбук: на экране флипбук, сцена выгружена', async () => {
        const { editor, fx, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(fx);
        editor.openDocument(flip);
        editor.openDocument(fx);
        editor.closeTab(fx);
        expect(editor.activeFlipbookId).toBe(flip);
        expect(editor.openDocId).toBeNull();
        expect(tabIds(editor)).toEqual([flip]);
    });

    it('«закрыть остальные» на флипбуке оставляет его одного и выгружает сцену; на сцене закрывает флипбуки', async () => {
        const { editor, fx, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(fx);
        editor.openDocument(flip);
        editor.closeOtherTabs(flip);
        expect(tabIds(editor)).toEqual([flip]);
        expect(editor.openDocId).toBeNull();
        expect(editor.activeFlipbookId).toBe(flip);

        editor.openDocument(fx);
        editor.openDocument(flip);
        editor.closeOtherTabs(fx);
        expect(tabIds(editor)).toEqual([fx]);
        expect(editor.activeFlipbookId).toBeNull();
    });

    it('«закрыть все» убирает и флипбук с экрана', async () => {
        const { editor, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(flip);
        editor.closeAllTabs();
        expect(editor.activeFlipbookId).toBeNull();
        expect(editor.tabs).toEqual([]);
    });

    it('«Новый проект» и открытие другого забывают флипбуки и их историю', async () => {
        const { editor, flip } = await setup();
        editor.updateFlipbook(flip, { fps: 5 });
        editor.newProject();
        expect(editor.activeFlipbookId).toBeNull();
        expect(editor.tabs).toEqual([]);
        expect(editor.canUndo).toBe(false);
    });
});

describe('флипбук: правка и история', () => {
    it('правка пишет тело в проект, закрепляет предпросмотр и делает проект «не сохранённым»', async () => {
        const { editor, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(flip, true);
        expect(editor.updateFlipbook(flip, { fps: 24 })).toBe(true);
        expect(editor.project.readDoc(flip)!.body.fps).toBe(24);
        expect(editor.flipbook!.fps).toBe(24);
        expect(tabIds(editor)).toEqual([flip]); // закреплена
        expect(editor.dirty).toBe(true);
    });

    it('негодное тело и неизвестный документ не записываются', async () => {
        const { editor, flip, fx } = await setup();
        expect(editor.updateFlipbook(flip, { fps: -1 })).toBe(false);
        expect(editor.updateFlipbook(flip, { fps: Infinity })).toBe(false);
        expect(editor.project.readDoc(flip)!.body.fps).toBe(12);
        expect(editor.updateFlipbook('нет-такого', { fps: 5 })).toBe(false);
        expect(editor.updateFlipbook(fx, { fps: 5 })).toBe(false); // не флипбук
        expect(editor.canUndo).toBe(false); // неудачные правки в историю не попали
    });

    it('отмена и возврат работают на флипбуке, пока он на экране, и не трогают сцену', async () => {
        const { editor, fx, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(fx);
        editor.updateSystem('seed', (s) => (s.seed = 9));
        editor.openDocument(flip);
        expect(editor.canUndo).toBe(false); // история флипбука пуста, хотя у сцены правка есть
        editor.updateFlipbook(flip, { fps: 30 });
        editor.updateFlipbook(flip, { fps: 40 });
        expect(editor.canUndo).toBe(true);
        editor.undo();
        expect(editor.flipbook!.fps).toBe(30);
        expect(editor.canRedo).toBe(true);
        editor.undo();
        expect(editor.flipbook!.fps).toBe(12);
        expect(editor.canUndo).toBe(false);
        editor.undo(); // отменять нечего: ничего не происходит
        expect(editor.flipbook!.fps).toBe(12);
        editor.redo();
        editor.redo();
        expect(editor.flipbook!.fps).toBe(40);
        editor.redo();
        expect(editor.flipbook!.fps).toBe(40);
        expect(editor.system!.seed).toBe(9); // сцена не тронута
        editor.openDocument(fx);
        expect(editor.canUndo).toBe(true); // и снова отмена сцены
    });

    it('новая правка после отмены сбрасывает возврат', async () => {
        const { editor, flip } = await setup();
        editor.updateFlipbook(flip, { fps: 30 });
        editor.undo();
        expect(editor.canRedo).toBe(true);
        editor.updateFlipbook(flip, { fps: 31 });
        expect(editor.canRedo).toBe(false);
    });

    it('подряд идущие правки одного поля склеиваются, разных нет; отмена возвращает и кадры', async () => {
        const { editor, flip } = await setup();
        editor.updateFlipbook(flip, { fps: 20 }, 'fps');
        editor.updateFlipbook(flip, { fps: 21 }, 'fps');
        editor.updateFlipbook(flip, { fps: 22 }, 'fps');
        editor.updateFlipbook(flip, { frames: [] }, 'frames');
        editor.undo();
        expect(editor.flipbook!.frames).toEqual(FRAMES);
        expect(editor.flipbook!.fps).toBe(22);
        editor.undo();
        expect(editor.flipbook!.fps).toBe(12); // три правки fps были одной записью
    });

    it('отмена не закрепляет предпросмотр и откатывает запись в проект', async () => {
        const { editor, flip } = await setup();
        editor.updateFlipbook(flip, { fps: 18 });
        editor.undo();
        expect(editor.project.readDoc(flip)!.body.fps).toBe(12);
    });

    it('у каждого флипбука своя история, она переживает переход на другую вкладку', async () => {
        const { editor, flip } = await setup();
        const other = editor.createFlipbook()!;
        editor.updateFlipbook(flip, { fps: 33 });
        editor.updateFlipbook(other, { fps: 44 });
        editor.openDocument(flip);
        editor.undo();
        expect(editor.project.readDoc(flip)!.body.fps).toBe(12);
        expect(editor.project.readDoc(other)!.body.fps).toBe(44);
        editor.openDocument(other);
        expect(editor.canUndo).toBe(true);
        editor.undo();
        expect(editor.project.readDoc(other)!.body.fps).toBe(12);
    });

    it('закрытие вкладки забывает историю: после повторного открытия отменять нечего', async () => {
        const { editor, flip } = await setup();
        editor.updateFlipbook(flip, { fps: 33 });
        editor.closeTab(flip);
        editor.openDocument(flip);
        expect(editor.canUndo).toBe(false);
        expect(editor.flipbook!.fps).toBe(33);
    });

    it('предпросмотр сцены заменяет предпросмотр флипбука: флипбук с экрана уходит', async () => {
        const { editor, fx, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(flip, true);
        editor.openDocument(fx, true);
        expect(editor.activeFlipbookId).toBeNull();
        expect(tabIds(editor)).toEqual([`${fx}*`]);
    });

    it('правка применяется и когда вкладку закрепили до неё: после неё закрепление держится', async () => {
        const { editor, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(flip, true);
        editor.pinTab(flip);
        await nextTick();
        expect(tabIds(editor)).toEqual([flip]);
    });
});

describe('флипбук: удаление и переименование', () => {
    it('удаление флипбука на экране отдаёт экран соседней вкладке, история забыта', async () => {
        const { editor, fx, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(fx);
        editor.openDocument(flip);
        expect(editor.deleteResource(flip, true)).toEqual({ ok: true });
        expect(editor.activeFlipbookId).toBeNull();
        expect(editor.openDocId).toBe(fx);
        expect(tabIds(editor)).toEqual([fx]);
        expect(editor.project.find(flip)).toBeUndefined();
    });

    it('удаление последнего флипбука на экране: остаётся пустая заготовка', async () => {
        const { editor, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(flip);
        editor.deleteResource(flip, true);
        expect(editor.activeFlipbookId).toBeNull();
        expect(editor.tabs).toEqual([]);
    });

    it('удаление флипбука на экране отдаёт экран другому флипбуку, если он сосед', async () => {
        const { editor, flip } = await setup();
        const other = editor.createFlipbook()!;
        editor.closeAllTabs();
        editor.openDocument(flip);
        editor.openDocument(other);
        editor.deleteResource(other, true);
        expect(editor.activeFlipbookId).toBe(flip);
    });

    it('удаление сцены на экране, а справа флипбук: на экране флипбук', async () => {
        const { editor, fx, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(fx);
        editor.openDocument(flip);
        editor.openDocument(fx);
        editor.deleteResource(fx, true);
        expect(editor.activeFlipbookId).toBe(flip);
        expect(editor.tabs.map((t) => t.docId)).toContain(flip);
        expect(editor.tabs.map((t) => t.docId)).not.toContain(fx);
    });

    it('удалённая сцена заменяется ближайшей живой вкладкой, а не «главным» документом проекта', async () => {
        const editor = useEditor();
        const a = editor.createDocument('effect')!; // effects/effect.fx.json
        const b = editor.createDocument('effect')!; // effects/effect 2.fx.json: по пути он «главный»
        const mat = editor.createDocument('material')!;
        const flip = editor.createFlipbook()!;
        editor.closeAllTabs();
        [a, mat, flip].forEach((id) => editor.openDocument(id));
        expect(editor.project.find(b)).toBeDefined();
        editor.deleteResource(mat, true);
        expect(editor.openDocId).toBe(a);
        expect(editor.activeFlipbookId).toBe(flip);
    });

    it('удаление флипбука, который не на экране, ничего на экране не меняет', async () => {
        const { editor, fx, flip } = await setup();
        editor.closeAllTabs();
        editor.openDocument(flip);
        editor.openDocument(fx);
        editor.deleteResource(flip, true);
        expect(editor.openDocId).toBe(fx);
        expect(tabIds(editor)).toEqual([fx]);
    });

    it('картинку, на которую ссылается флипбук, без force не удалить, а с force флипбук остаётся с висящей ссылкой и открывается', async () => {
        const { editor, image, flip } = await setup();
        const refused = editor.deleteResource(image, false);
        expect(refused).toMatchObject({ ok: false });
        expect((refused as { referrers: { id: string }[] }).referrers.map((r) => r.id)).toEqual([flip]);
        expect(editor.deleteResource(image, true)).toEqual({ ok: true });
        expect(editor.flipbook).toMatchObject({ image, frames: FRAMES });
        expect(editor.project.find(image)).toBeUndefined();
        expect(editor.updateFlipbook(flip, { fps: 7 })).toBe(true); // правка висящего флипбука возможна
    });

    it('удаление сцены, пока на экране флипбук: экран остаётся за флипбуком, сцена заменяется живым соседом', async () => {
        const { editor, fx, mat, flip } = await setup();
        editor.closeAllTabs();
        [fx, mat, flip].forEach((id) => editor.openDocument(id));
        editor.deleteResource(mat, true);
        expect(editor.activeFlipbookId).toBe(flip);
        expect(editor.openDocId).toBe(fx);
        expect(tabIds(editor)).toEqual([fx, flip]);
    });

    it('переименование флипбука: имя без папки и расширения, id и ссылка остаются', async () => {
        const { editor, image, flip } = await setup();
        expect(editor.renameResource(flip, 'взрыв')).toBe('ok');
        expect(editor.project.find(flip)).toMatchObject({ path: 'flipbooks/взрыв.flip.json', refs: [image] });
        expect(editor.renameResource(flip, 'новый.flip.json')).toBe('ok');
        expect(editor.project.find(flip)!.path).toBe('flipbooks/новый.flip.json');
    });
});
