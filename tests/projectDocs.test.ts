// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assetNameOf, emptyLink, newDocument, renamableName, renamedPath, saveProjectDoc } from '@/editor/projectFile';
import { useEditor } from '@/editor/store';
import { packProject } from '@/project/archive';
import { createProject } from '@/project/project';

const PNG_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const file = (content: string | Uint8Array, name: string) => new File([content as BlobPart], name);
const paths = (editor: ReturnType<typeof useEditor>) => editor.project.resources.map((r) => r.path).sort();
const noDownload = () => {
    vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:x');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
};

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});
afterEach(() => vi.restoreAllMocks());

describe('имена ресурсов', () => {
    const doc = { path: 'effects/boom.fx.json', type: 'doc' as const };
    const image = { path: 'textures/Sheet.PNG', type: 'asset' as const };

    it('переименуемое имя: без папки и расширения', () => {
        expect(renamableName(doc)).toBe('boom');
        expect(renamableName({ path: 'a/b.mat.json', type: 'doc' })).toBe('b');
        expect(renamableName({ path: 'flipbooks/boom.flip.json', type: 'doc' })).toBe('boom');
        expect(renamableName({ path: 'a/plain.json', type: 'doc' })).toBe('plain');
        expect(renamableName(image)).toBe('Sheet');
    });

    it('новый путь: папка и расширение остаются, лишнее расширение в имени отбрасывается', () => {
        expect(renamedPath(doc, 'bang')).toBe('effects/bang.fx.json');
        expect(renamedPath(doc, '  bang  ')).toBe('effects/bang.fx.json');
        expect(renamedPath(doc, 'bang.fx.json')).toBe('effects/bang.fx.json');
        expect(renamedPath(doc, 'Взрыв 2')).toBe('effects/Взрыв 2.fx.json');
        expect(renamedPath(image, 'boom')).toBe('textures/boom.PNG');
        expect(renamedPath(image, 'boom.png')).toBe('textures/boom.PNG');
        expect(renamedPath({ path: 'a.fx.json', type: 'doc' }, 'b')).toBe('b.fx.json');
    });

    it('негодное имя: пустое, с косой чертой, запрещённое Windows, сорвавшее путь', () => {
        for (const bad of ['', '   ', 'a/b', 'a\\b', 'con', 'what?', 'x:', 'trail.', '..', '.fx.json']) expect(renamedPath(doc, bad), JSON.stringify(bad)).toBeNull();
        expect(renamedPath(doc, 'x'.repeat(200))).toBeNull();
    });

    it('имя, из которого получилась бы запись ассета (.meta.json), не годится', () => {
        expect(renamedPath({ path: 'a/plain.json', type: 'doc' }, 'x.meta')).toBeNull();
        expect(renamedPath({ path: 'a/plain.json', type: 'doc' }, 'x')).toBe('a/x.json');
    });

    it('имя картинки при импорте', () => {
        expect(assetNameOf('Hero.PNG')).toBe('Hero.png');
        expect(assetNameOf('a:b?c.JPG')).toBe('a_b_c.jpg');
        expect(assetNameOf('con.png')).toBe('texture.png');
    });
});

describe('заготовки документов', () => {
    it('эффект с системой частиц, материал без неё; каждый раз своя копия', () => {
        const effect = newDocument('effect');
        expect(effect.system).not.toBeNull();
        expect(Object.keys(effect.graph.nodes).length).toBeGreaterThan(0);
        expect(newDocument('material').system).toBeNull();
        effect.graph.nodes.p!.x = 99999;
        expect(newDocument('effect').graph.nodes.p!.x).not.toBe(99999);
    });
});

describe('сохранение документа в проект: файл без нужды не переписывается', () => {
    it('сдвиг камеры не меняет файл, настоящая правка меняет', () => {
        const project = createProject();
        const doc = newDocument('effect');
        const link = saveProjectDoc(project, doc, { x: 0, y: 0, z: 1 }, emptyLink(), '');
        const revision = project.files.revision;

        saveProjectDoc(project, doc, { x: 500, y: -40, z: 2 }, link, '');
        expect(project.files.revision).toBe(revision);
        expect(project.readDoc(link.docId!)!.body.view).toEqual({ x: 0, y: 0, z: 1 });

        doc.system!.seed = 4242;
        saveProjectDoc(project, doc, { x: 500, y: -40, z: 2 }, link, '');
        expect(project.files.revision).toBeGreaterThan(revision);
        expect(project.readDoc(link.docId!)!.body.view).toEqual({ x: 500, y: -40, z: 2 });
    });

    it('writeDoc с тем же телом ничего не пишет', () => {
        const project = createProject();
        const link = saveProjectDoc(project, newDocument('material'), { x: 0, y: 0, z: 1 }, emptyLink(), '');
        const body = project.readDoc(link.docId!)!.body;
        const revision = project.files.revision;
        project.writeDoc(link.docId!, body);
        expect(project.files.revision).toBe(revision);
    });
});

describe('документы в проекте', () => {
    it('создание: эффект и материал получают свои файлы, имена не повторяются, документ открывается сразу', () => {
        const editor = useEditor();
        const first = editor.createDocument('effect');
        const second = editor.createDocument('effect');
        const third = editor.createDocument('material');
        expect(new Set([first, second, third]).size).toBe(3);
        expect(editor.openDocId).toBe(third);
        expect(editor.system).toBeNull();
        expect(paths(editor)).toEqual(['effects/effect 2.fx.json', 'effects/effect.fx.json', 'materials/material.mat.json']);
        expect(editor.dirty).toBe(true);
    });

    it('открытый документ при уходе записывается в проект, правка не теряется', () => {
        const editor = useEditor();
        const material = editor.createDocument('material')!;
        editor.setValue('mask', 'low', 0.77);
        const effect = editor.createDocument('effect')!;
        expect(editor.system).not.toBeNull();

        editor.openDocument(material);
        expect(editor.system).toBeNull();
        expect(editor.graph.nodes.mask!.values.low).toBe(0.77);
        editor.openDocument(effect);
        expect(editor.system).not.toBeNull();
    });

    it('открыть уже открытый ничего не делает; несуществующий и не документ отказываются с сообщением', async () => {
        noDownload();
        const editor = useEditor();
        const id = editor.createDocument('effect')!;
        expect(editor.openDocument(id)).toBe(true);
        expect(editor.openDocument('нетТакого')).toBe(false);
        expect(editor.notice).toMatchObject({ kind: 'error' });
        await editor.importFiles([file(Uint8Array.of(1, 2, 3), 'x.png')]);
        const image = editor.project.resources.find((r) => r.kind === 'image')!;
        expect(editor.openDocument(image.id)).toBe(false);
        expect(editor.openDocId).toBe(id);
    });

    it('«не сохранено»: смена документа и сдвиг камеры не делают проект грязным', async () => {
        noDownload();
        const editor = useEditor();
        editor.createDocument('effect');
        const other = editor.createDocument('material')!;
        await editor.saveProject();
        expect(editor.dirty).toBe(false);

        editor.camera = { x: 321, y: 123, z: 1.7 };
        editor.openDocument(editor.project.resources.find((r) => r.id !== other && r.kind === 'effect')!.id);
        expect(editor.dirty).toBe(false);
        editor.openDocument(other);
        expect(editor.dirty).toBe(false);

        editor.setValue('mask', 'low', 0.25);
        expect(editor.dirty).toBe(true);
    });

    it('создание, переименование и удаление делают проект грязным, сохранение снимает', async () => {
        noDownload();
        const editor = useEditor();
        const id = editor.createDocument('effect')!;
        await editor.saveProject();
        expect(editor.dirty).toBe(false);
        editor.renameResource(id, 'другое');
        expect(editor.dirty).toBe(true);
        await editor.saveProject();
        expect(editor.dirty).toBe(false);
        editor.deleteResource(id, true);
        expect(editor.dirty).toBe(true);
    });
});

describe('открытие документа: тонкости', () => {
    it('открытие уже открытого не сбрасывает историю правок', () => {
        const editor = useEditor();
        const id = editor.createDocument('material')!;
        editor.setValue('mask', 'low', 0.6);
        expect(editor.canUndo).toBe(true);
        expect(editor.openDocument(id)).toBe(true);
        expect(editor.canUndo).toBe(true);
    });

    it('ресурс, не являющийся документом (картинка), не открывается', () => {
        const editor = useEditor();
        editor.createDocument('effect');
        const image = editor.project.addAsset('textures/a.png', new Uint8Array([1]));
        expect(editor.openDocument(image.id)).toBe(false);
        expect(editor.notice).toMatchObject({ kind: 'error' });
    });

    it('пропавшая картинка при открытии: уведомление с числом замечаний', async () => {
        const editor = useEditor();
        const legacy = JSON.parse(editor.exportText());
        legacy.graph.nodes.tex = { id: 'tex', type: 'input/texture', x: 0, y: 300, values: {}, params: { texture: 'sheet' } };
        legacy.graph.textures = { sheet: { src: PNG_URI } };
        await editor.openFile(file(JSON.stringify(legacy), 'with-texture.json'));
        editor.syncDocument();
        const doc = editor.project.resources.find((r) => r.type === 'doc')!.id;
        const image = editor.project.resources.find((r) => r.kind === 'image')!;
        const other = editor.createDocument('effect')!;
        editor.project.files.delete(image.path);
        editor.project.files.delete(image.metaPath!);

        editor.openDocument(doc);
        expect(editor.notice).toMatchObject({ kind: 'error', key: 'file.loadedWithProblems', args: [expect.any(Number), 1] });
        expect(editor.openDocId).not.toBe(other);
    });

    it('созданная заготовка уже записана в разобранном виде: синхронизация ничего не переписывает', () => {
        const editor = useEditor();
        editor.createDocument('effect');
        const revision = editor.project.files.revision;
        editor.syncDocument();
        expect(editor.project.files.revision).toBe(revision);
    });
});

describe('нетронутая заготовка не становится файлом сама', () => {
    it('демо при запуске: «Новый эффект» не оставляет за собой лишний материал, а правленное демо сохраняется', () => {
        const untouched = useEditor();
        untouched.createDocument('effect');
        expect(untouched.project.resources.map((r) => r.kind)).toEqual(['effect']);

        setActivePinia(createPinia());
        const edited = useEditor();
        edited.setValue('mask', 'low', 0.3);
        edited.createDocument('effect');
        expect(edited.project.resources.map((r) => r.path).sort()).toEqual(['effects/effect.fx.json', 'materials/material.mat.json']);
    });

    it('после «Новый проект» пустой документ тоже заготовка', async () => {
        const editor = useEditor();
        await editor.openFile(file(editor.exportText(), 'x.json')); // открытый файл: уже не заготовка
        editor.newProject();
        await editor.importFiles([file(Uint8Array.of(1), 'a.png')]);
        expect(paths(editor)).toEqual(['textures/a.png']);
    });

    it('после удаления последнего документа пустой документ тоже заготовка', async () => {
        const editor = useEditor();
        editor.deleteResource(editor.createDocument('effect')!, true);
        await editor.importFiles([file(Uint8Array.of(1), 'a.png')]);
        expect(paths(editor)).toEqual(['textures/a.png']);
    });

    it('проект без документов открывается заготовкой', async () => {
        const empty = createProject({ name: 'пустой' });
        const bytes = await packProject(empty);
        const editor = useEditor();
        await editor.openFile(file(bytes, 'пустой.taofx'));
        await editor.importFiles([file(Uint8Array.of(1), 'a.png')]);
        expect(paths(editor)).toEqual(['textures/a.png']);
    });
});

describe('переименование', () => {
    it('меняет файл, оставляя id и ссылки; открытый документ после этого сохраняется под новым именем', () => {
        const editor = useEditor();
        const id = editor.createDocument('effect')!;
        expect(editor.renameResource(id, 'взрыв')).toBe('ok');
        expect(paths(editor)).toEqual(['effects/взрыв.fx.json']);
        expect(editor.project.find(id)?.path).toBe('effects/взрыв.fx.json');
        editor.updateSystem('seed', (s) => (s.seed = 31337));
        editor.syncDocument();
        expect(paths(editor)).toEqual(['effects/взрыв.fx.json']); // новой копии под старым именем нет
        expect(editor.project.readDoc(id)!.body.system).toMatchObject({ seed: 31337 });
    });

    it('исходы: тот же, занятый, негодный, несуществующий', () => {
        const editor = useEditor();
        const a = editor.createDocument('effect')!;
        const b = editor.createDocument('effect')!;
        expect(editor.renameResource(a, 'effect')).toBe('unchanged');
        expect(editor.renameResource(b, 'effect')).toBe('taken');
        expect(editor.renameResource(b, 'EFFECT')).toBe('taken'); // регистр не различает файлы
        expect(editor.renameResource(b, 'a/b')).toBe('invalid');
        expect(editor.renameResource('нет', 'x')).toBe('missing');
        expect(paths(editor)).toEqual(['effects/effect 2.fx.json', 'effects/effect.fx.json']);
    });

    it('смена одного регистра проходит', () => {
        const editor = useEditor();
        const id = editor.createDocument('material')!;
        expect(editor.renameResource(id, 'MATERIAL')).toBe('ok');
        expect(paths(editor)).toEqual(['materials/MATERIAL.mat.json']);
    });
});

describe('удаление', () => {
    it('удаляет файл; если удалён открытый документ, открывается оставшийся', () => {
        const editor = useEditor();
        const a = editor.createDocument('effect')!;
        const b = editor.createDocument('material')!;
        expect(editor.deleteResource(b, true)).toEqual({ ok: true });
        expect(paths(editor)).toEqual(['effects/effect.fx.json']);
        expect(editor.openDocId).toBe(a);
        expect(editor.system).not.toBeNull();
    });

    it('удалён последний документ: открывается пустой документ без файла', () => {
        const editor = useEditor();
        const only = editor.createDocument('effect')!;
        editor.deleteResource(only, true);
        expect(editor.project.resources).toEqual([]);
        expect(editor.openDocId).toBeNull();
        expect(Object.keys(editor.graph.nodes)).toHaveLength(0);
        expect(editor.system).toBeNull();
    });

    it('несуществующий ресурс сообщает об этом', () => {
        expect(useEditor().deleteResource('нет')).toEqual({ ok: false, missing: true });
    });

    it('открытый документ записывается перед удалением: убранная в нём картинка не считается используемой', async () => {
        const editor = useEditor();
        const legacy = JSON.parse(editor.exportText());
        legacy.graph.nodes.tex = { id: 'tex', type: 'input/texture', x: 0, y: 300, values: {}, params: { texture: 'sheet' } };
        legacy.graph.textures = { sheet: { src: PNG_URI } };
        await editor.openFile(file(JSON.stringify(legacy), 'with-texture.json'));
        editor.syncDocument();
        const image = editor.project.resources.find((r) => r.kind === 'image')!;
        delete editor.graph.nodes.tex; // в открытом документе ноду с картинкой убрали, в файле она ещё есть
        expect(editor.referrersOf(image.id)).toEqual([]);
        expect(editor.deleteResource(image.id, false)).toEqual({ ok: true }); // на неё никто не ссылается, спрашивать не о чем
        expect(editor.project.find(image.id)).toBeUndefined();
    });

    it('удаление записывает открытый документ, и убранная из него картинка удаляется без вопроса', async () => {
        const editor = useEditor();
        const legacy = JSON.parse(editor.exportText());
        legacy.graph.nodes.tex = { id: 'tex', type: 'input/texture', x: 0, y: 300, values: {}, params: { texture: 'sheet' } };
        legacy.graph.textures = { sheet: { src: PNG_URI } };
        await editor.openFile(file(JSON.stringify(legacy), 'with-texture.json'));
        editor.syncDocument();
        const image = editor.project.resources.find((r) => r.kind === 'image')!;
        delete editor.graph.nodes.tex;
        expect(editor.deleteResource(image.id, false)).toEqual({ ok: true });
        expect(editor.project.find(image.id)).toBeUndefined();
    });

    it('если после удаления открытого документа оставшийся не открывается, документ отвязывается и не воскресает при записи', () => {
        const editor = useEditor();
        const broken = editor.createDocument('material')!;
        const open = editor.createDocument('effect')!;
        editor.project.writeDoc(broken, { graph: { nodes: { a: { id: 'a', type: 'нет/такой', x: 0, y: 0, values: {} } }, connections: [] } });

        editor.deleteResource(open, true);
        expect(editor.notice).toMatchObject({ kind: 'error' });
        expect(editor.openDocId).toBeNull();
        editor.syncDocument();
        expect(paths(editor)).toEqual(['materials/material.mat.json']); // удалённый эффект не создан заново
    });

    it('картинка, на которую ссылается открытый документ: ссылающиеся названы, без force не удаляется', async () => {
        const editor = useEditor();
        const legacy = JSON.parse(editor.exportText());
        legacy.graph.nodes.tex = { id: 'tex', type: 'input/texture', x: 0, y: 300, values: {}, params: { texture: 'sheet' } };
        legacy.graph.textures = { sheet: { src: PNG_URI } };
        await editor.openFile(file(JSON.stringify(legacy), 'with-texture.json'));
        editor.syncDocument();

        const image = editor.project.resources.find((r) => r.kind === 'image')!;
        const doc = editor.project.resources.find((r) => r.type === 'doc')!;
        expect(editor.referrersOf(image.id).map((r) => r.id)).toEqual([doc.id]);

        const refused = editor.deleteResource(image.id, false);
        expect(refused).toMatchObject({ ok: false });
        expect((refused as { referrers: unknown[] }).referrers).toHaveLength(1);
        expect(editor.project.find(image.id)).toBeDefined();

        expect(editor.deleteResource(image.id, true)).toEqual({ ok: true });
        expect(editor.project.find(image.id)).toBeUndefined();
        expect(editor.graph.textures ?? {}).toEqual({}); // открытый документ поднят заново, уже без картинки
        editor.syncDocument();
        expect(editor.project.resources.filter((r) => r.kind === 'image')).toHaveLength(0); // и при сохранении она не вернулась
    });
});

describe('добавление файлов', () => {
    it('картинки становятся ассетами в textures/, повтор имени получает номер', async () => {
        const editor = useEditor();
        const result = await editor.importFiles([file(Uint8Array.of(1), 'Hero.PNG'), file(Uint8Array.of(2), 'Hero.PNG'), file(Uint8Array.of(3), 'a:b.jpg')]);
        expect(result).toEqual({ images: 3, documents: 0, skipped: 0 });
        expect(paths(editor)).toEqual(['textures/Hero 2.png', 'textures/Hero.png', 'textures/a_b.jpg']);
        expect(editor.notice).toMatchObject({ kind: 'info', key: 'project.imported', args: [3, 0] });
        expect(editor.project.problems).toEqual([]);
    });

    it('.json прежнего вида становится документом и открывается; имя берётся из файла', async () => {
        const editor = useEditor();
        editor.startParticles();
        const text = editor.exportText();
        editor.newProject();
        const result = await editor.importFiles([file(text, 'boom.json')]);
        expect(result).toEqual({ images: 0, documents: 1, skipped: 0 });
        expect(paths(editor)).toContain('effects/boom.fx.json');
        expect(editor.system).not.toBeNull();
        expect(editor.openDocId).toBe(editor.project.resources.find((r) => r.path === 'effects/boom.fx.json')!.id);
    });

    it('слишком большой .json пропускается, у имени taofx.json документ без имени «taofx»', async () => {
        const editor = useEditor();
        editor.startParticles();
        const text = editor.exportText();
        editor.newProject(); // текущий документ нетронутая заготовка: в проект сам не попадёт
        const tooBig = text + ' '.repeat(5_000_001); // верный JSON, но больше предела
        const result = await editor.importFiles([file(tooBig, 'big.json'), file(text, 'taofx.json')]);
        expect(result).toEqual({ images: 0, documents: 1, skipped: 1 });
        expect(paths(editor)).toEqual(['effects/effect.fx.json']);
    });

    it('запись ассета на месте будущей картинки не затирается', async () => {
        const editor = useEditor();
        editor.project.files.write('textures/x.png.meta.json', '{}');
        await editor.importFiles([file(Uint8Array.of(1), 'x.png')]);
        expect(paths(editor)).toEqual(['textures/x 2.png']);
    });

    it('негодное пропускается и считается, причина по .json показана', async () => {
        const editor = useEditor();
        const result = await editor.importFiles([file('{"format":"nope"}', 'bad.json'), file('hello', 'notes.txt'), file(Uint8Array.of(1), 'ok.webp')]);
        expect(result).toEqual({ images: 1, documents: 0, skipped: 2 });
        expect(paths(editor)).toEqual(['textures/ok.webp']);
        expect(editor.notice).toMatchObject({ key: 'project.importSkipped', args: [2] });
    });

    it('ничего не подошло: сообщение об ошибке, проект не тронут', async () => {
        const editor = useEditor();
        await editor.importFiles([file('hello', 'notes.txt')]);
        expect(editor.notice).toMatchObject({ kind: 'error', key: 'project.importSkipped' });
        expect(editor.project.resources).toEqual([]);
    });
});
