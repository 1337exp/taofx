import { describe, expect, it } from 'vitest';
import { createFiles } from '../src/project/files';
import { isId } from '../src/project/ids';
import { createManifest, parseManifest, PROJECT_FILE, PROJECT_FORMAT, PROJECT_VERSION, serializeManifest } from '../src/project/manifest';
import { createProject, openProject, ProjectError, type Project } from '../src/project/project';
import { PathError } from '../src/project/paths';

const PNG = Uint8Array.of(137, 80, 78, 71);
const meta = (id: string, kind = 'image') => JSON.stringify({ format: 'taofx-asset', version: 1, id, kind, import: {} });
const flipbook = (id: string, image: string, extra: object = {}) => JSON.stringify({ format: 'taofx-flipbook', version: 1, id, image, frames: [{ x: 0, y: 0, w: 10, h: 10 }], fps: 12, ...extra });

const codeOf = (fn: () => unknown) => {
    try {
        fn();
    } catch (e) {
        return e instanceof ProjectError ? e.code : e instanceof PathError ? `path:${e.problem}` : String(e);
    }
    return 'no error';
};
const problemCodes = (p: Project) => p.problems.map((x) => `${x.code}:${x.path}`);

describe('манифест', () => {
    it('создаётся, пишется и читается обратно', () => {
        const m = createManifest('  Взрыв  ');
        expect(m).toMatchObject({ format: PROJECT_FORMAT, version: PROJECT_VERSION, name: 'Взрыв', settings: { pixelsPerUnit: 100 } });
        const back = parseManifest(serializeManifest(m));
        expect(back).toEqual({ ok: true, manifest: m });
    });

    it('ошибки читаются результатом', () => {
        const err = (text: string) => (parseManifest(text) as { error: string }).error;
        expect(err('{')).toBe('invalidJson');
        expect(err('[]')).toBe('notProject');
        expect(err('{"format":"taofx"}')).toBe('notProject');
        expect(err(`{"format":"${PROJECT_FORMAT}","version":${PROJECT_VERSION + 1},"name":""}`)).toBe('newerVersion');
        expect(err(`{"format":"${PROJECT_FORMAT}","version":1}`)).toBe('invalidStructure');
        expect(err(`{"format":"${PROJECT_FORMAT}","version":1,"name":"","settings":{"pixelsPerUnit":0}}`)).toBe('invalidStructure');
        expect(err(`{"format":"${PROJECT_FORMAT}","version":1.5,"name":""}`)).toBe('invalidStructure');
    });

    it('настройки по умолчанию, если их нет', () => {
        const r = parseManifest(`{"format":"${PROJECT_FORMAT}","version":1,"name":"x"}`);
        expect(r).toMatchObject({ ok: true, manifest: { settings: { pixelsPerUnit: 100 } } });
    });
});

describe('проект: создание, открытие, «не сохранено»', () => {
    it('новый проект: манифест в файлах, не «грязный»', () => {
        const p = createProject({ name: 'Взрыв' });
        expect(p.manifest.name).toBe('Взрыв');
        expect(p.files.has(PROJECT_FILE)).toBe(true);
        expect(p.dirty).toBe(false);
        expect(p.resources).toEqual([]);
        expect(p.problems).toEqual([]);
    });

    it('правка делает «грязным», markSaved возвращает чистоту', () => {
        const p = createProject();
        p.setManifest({ name: 'Новое', settings: { pixelsPerUnit: 64 } });
        expect(p.dirty).toBe(true);
        expect(p.manifest).toMatchObject({ name: 'Новое', settings: { pixelsPerUnit: 64 } });
        expect(parseManifest(p.files.text(PROJECT_FILE)!)).toMatchObject({ ok: true, manifest: { name: 'Новое' } });
        p.markSaved();
        expect(p.dirty).toBe(false);
        p.addAsset('a.png', PNG);
        expect(p.dirty).toBe(true);
    });

    it('openProject: нужен project.json', () => {
        expect(openProject(createFiles())).toEqual({ ok: false, error: 'noManifest' });
        expect(openProject(createFiles([[PROJECT_FILE, '{}']]))).toEqual({ ok: false, error: 'notProject' });
        const ok = openProject(createFiles([[PROJECT_FILE, serializeManifest(createManifest('p'))]]));
        expect(ok.ok).toBe(true);
        if (ok.ok) expect(ok.project.dirty).toBe(false);
    });

    it('снимок: project.json первым, .editor по просьбе', () => {
        const p = createProject();
        p.addAsset('a/a.png', PNG); // по алфавиту раньше project.json
        p.files.write('.editor/state.json', '{}');
        expect(p.snapshot().map((f) => f.path)).toEqual([PROJECT_FILE, 'a/a.png', 'a/a.png.meta.json']);
        expect(p.snapshot({ editor: true }).map((f) => f.path)).toContain('.editor/state.json');
    });
});

describe('проект: ассеты', () => {
    it('addAsset кладёт файл и запись с id', () => {
        const p = createProject();
        const r = p.addAsset('assets/hero.png', PNG);
        expect(r).toMatchObject({ kind: 'image', type: 'asset', path: 'assets/hero.png', metaPath: 'assets/hero.png.meta.json', refs: [] });
        expect(isId(r.id)).toBe(true);
        expect(p.find(r.id)).toEqual(r);
        expect(p.byPath('ASSETS/Hero.PNG')).toEqual(r);
        expect(p.importSettings(r.id)).toEqual({});
        expect([...p.files.read('assets/hero.png')!]).toEqual([...PNG]);
    });

    it('у двух ассетов разные id', () => {
        const p = createProject();
        const ids = new Set(Array.from({ length: 50 }, (_, i) => p.addAsset(`a/${i}.png`, PNG).id));
        expect(ids.size).toBe(50);
    });

    it('отказы: занятый путь, чужое расширение, sidecar как файл', () => {
        const p = createProject();
        p.addAsset('a.png', PNG);
        expect(codeOf(() => p.addAsset('A.png', PNG))).toBe('pathTaken');
        expect(codeOf(() => p.addAsset('a.txt', PNG))).toBe('wrongExtension');
        expect(codeOf(() => p.addAsset('a.png.meta.json', PNG))).toBe('wrongExtension');
        expect(codeOf(() => p.addAsset('../a.png', PNG))).toBe('path:dots');
    });

    it('если запись не вышла (слишком длинный путь), файл не остаётся', () => {
        const p = createProject();
        const long = ['x'.repeat(100), 'y'.repeat(100), 'z'.repeat(100), 'w'.repeat(100), 'v'.repeat(104) + '.png'].join('/');
        expect(long).toHaveLength(512);
        expect(codeOf(() => p.addAsset(long, PNG))).toBe('path:tooLong');
        expect(p.files.has(long)).toBe(false);
    });

    it('настройки импорта меняются, id остаётся', () => {
        const p = createProject();
        const r = p.addAsset('a.png', PNG);
        p.setImportSettings(r.id, { filter: 'nearest' });
        expect(p.importSettings(r.id)).toEqual({ filter: 'nearest' });
        expect(p.find(r.id)?.id).toBe(r.id);
    });
});

describe('проект: открытие чужого набора файлов', () => {
    const open = (entries: [string, string | Uint8Array][]) => {
        const r = openProject(createFiles([[PROJECT_FILE, serializeManifest(createManifest('p'))], ...entries]));
        if (!r.ok) throw new Error(r.error);
        return r.project;
    };

    it('картинка без записи: проблема, а adopt заводит запись', () => {
        const p = open([
            ['a.png', PNG],
            ['b.jpg', PNG],
        ]);
        expect(problemCodes(p)).toEqual(['missingMeta:a.png', 'missingMeta:b.jpg']);
        expect(p.resources).toEqual([]);
        expect(p.adopt()).toBe(2);
        expect(p.problems).toEqual([]);
        expect(new Set(p.resources.map((r) => r.id)).size).toBe(2);
        expect(p.dirty).toBe(true);
        expect(p.adopt()).toBe(0);
    });

    it('битые и лишние файлы описываются, не теряются и не мешают', () => {
        const p = open([
            ['ok.png', PNG],
            ['ok.png.meta.json', meta('abcdef12')],
            ['bad.png', PNG],
            ['bad.png.meta.json', meta('xx')],
            ['kind.png', PNG],
            ['kind.png.meta.json', meta('kindid12', 'flipbook')],
            ['orphan.png.meta.json', meta('orphan12')],
            ['broken.json', '{'],
            ['future.json', JSON.stringify({ format: 'taofx-future', version: 1 })],
            ['newer.json', flipbook('newer123', '', {}).replace('"version":1', '"version":99')],
            ['particles.json', JSON.stringify({ format: 'taofx-particles', version: 1 })],
            ['noid.json', JSON.stringify({ format: 'taofx-flipbook', version: 1, image: '', frames: [], fps: 1 })],
            ['badbody.json', flipbook('badbody1', '', { fps: -1 })],
            ['foreign.json', JSON.stringify({ hello: 'world' })],
            ['notes.txt', 'hi'],
            ['.editor/state.json', '{'],
        ]);
        expect(p.resources.map((r) => r.id)).toEqual(['abcdef12']);
        expect(problemCodes(p).sort()).toEqual(
            [
                'badDoc:badbody.json',
                'badDoc:noid.json',
                'badJson:broken.json',
                'badMeta:bad.png.meta.json',
                'badMeta:kind.png.meta.json',
                'orphanMeta:orphan.png.meta.json',
                'unknownFormat:future.json',
                'unknownFormat:newer.json',
                'unknownFormat:particles.json',
            ].sort(),
        );
        // ничего не потеряно: все файлы на месте и попадут в снимок
        expect(p.files.has('broken.json')).toBe(true);
        expect(p.snapshot().map((f) => f.path)).toContain('particles.json');
    });

    it('повтор id: побеждает первый по пути, второй в проблемах', () => {
        const p = open([
            ['a.json', flipbook('sameid12', '')],
            ['b.json', flipbook('sameid12', '')],
        ]);
        expect(p.resources.map((r) => r.path)).toEqual(['a.json']);
        expect(problemCodes(p)).toEqual(['duplicateId:b.json']);
    });
});

describe('проект: документы и ссылки', () => {
    const setup = () => {
        const p = createProject();
        const image = p.addAsset('assets/explosion.jpg', PNG);
        const doc = p.addDoc('assets/explosion.flipbook.json', 'flipbook', { image: image.id, frames: [{ x: 0, y: 0, w: 71, h: 99 }], fps: 8 });
        return { p, image, doc };
    };

    it('addDoc пишет заголовок и тело, readDoc отдаёт тело без заголовка', () => {
        const { p, image, doc } = setup();
        expect(doc).toMatchObject({ kind: 'flipbook', type: 'doc', refs: [image.id] });
        expect(JSON.parse(p.files.text(doc.path)!)).toMatchObject({ format: 'taofx-flipbook', version: 1, id: doc.id, fps: 8 });
        const read = p.readDoc(doc.id)!;
        expect(read.body).toEqual({ image: image.id, frames: [{ x: 0, y: 0, w: 71, h: 99 }], fps: 8 });
        expect(p.readDoc(image.id)).toBeUndefined(); // у ассета тела нет
        expect(p.problems).toEqual([]);
    });

    it('writeDoc оставляет id и формат, проверяет тело, не даёт подменить заголовок', () => {
        const { p, image, doc } = setup();
        p.writeDoc(doc.id, { image: image.id, frames: [], fps: 24, id: 'hacked', format: 'x' });
        expect(JSON.parse(p.files.text(doc.path)!)).toMatchObject({ format: 'taofx-flipbook', id: doc.id, fps: 24 });
        expect(codeOf(() => p.writeDoc(doc.id, { image: image.id, frames: [], fps: 0 }))).toBe('invalidDoc');
        expect(codeOf(() => p.writeDoc('нетТакого', {}))).toBe('missing');
        expect(p.readDoc(doc.id)!.body.fps).toBe(24); // неудачная запись ничего не испортила
    });

    it('флипбук: настройки поиска кадров и ключ фона необязательны, но если есть, то верной формы', () => {
        const { p, image } = setup();
        const base = { image: image.id, frames: [], fps: 8 };
        const ok = (extra: object) => codeOf(() => p.addDoc(`ok${Math.random()}.flipbook.json`, 'flipbook', { ...base, ...extra }));
        const grid = { mode: 'grid', cols: 4, rows: 2 };
        const auto = { mode: 'auto', color: [63, 51, 63], tolerance: 2, gap: 0, minSize: 1 };
        expect(ok({ detect: grid, key: { color: [1, 2, 3], low: 6, high: 34 } })).toBe('no error');
        expect(ok({ detect: auto, key: null })).toBe('no error');
        for (const detect of [5, null, {}, { mode: 'grid', cols: 0, rows: 1 }, { mode: 'grid', cols: 1, rows: 1.5 }, { mode: 'auto' }, { ...auto, color: [1, 2] }, { ...auto, color: [1, 2, 300] }, { ...auto, tolerance: 'x' }, { ...auto, gap: NaN }, { ...auto, minSize: null }, { mode: 'wrong' }]) {
            expect(ok({ detect }), JSON.stringify(detect)).toBe('invalidDoc');
        }
        for (const key of [5, {}, { color: [1, 2, 3] }, { color: [1, 2, 3], low: 1 }, { color: [1, 2, 3], low: NaN, high: 2 }, { color: [1, 2], low: 1, high: 2 }, { color: [1, 2, 256], low: 1, high: 2 }]) {
            expect(ok({ key }), JSON.stringify(key)).toBe('invalidDoc');
        }
    });

    it('addDoc: отказы', () => {
        const { p } = setup();
        expect(codeOf(() => p.addDoc('x.json', 'нет'))).toBe('unknownKind');
        expect(codeOf(() => p.addDoc('x.json', 'image'))).toBe('unknownKind'); // ассет не документ
        expect(codeOf(() => p.addDoc('x.txt', 'flipbook'))).toBe('wrongExtension');
        expect(codeOf(() => p.addDoc('project.json', 'flipbook'))).toBe('wrongExtension');
        expect(codeOf(() => p.addDoc('assets/explosion.flipbook.json', 'flipbook'))).toBe('pathTaken');
        expect(codeOf(() => p.addDoc('y.json', 'flipbook', { fps: -3 }))).toBe('invalidDoc');
    });

    it('кто ссылается и удаление под защитой', () => {
        const { p, image, doc } = setup();
        expect(p.referrers(image.id)).toEqual([doc]);
        expect(p.dangling()).toEqual([]);

        const blocked = p.remove(image.id);
        expect(blocked).toEqual({ ok: false, referrers: [doc] });
        expect(p.files.has('assets/explosion.jpg')).toBe(true);

        const forced = p.remove(image.id, { force: true });
        expect(forced).toEqual({ ok: true, dangling: [doc] });
        expect(p.files.has('assets/explosion.jpg')).toBe(false);
        expect(p.files.has('assets/explosion.jpg.meta.json')).toBe(false);
        expect(p.dangling()).toEqual([{ from: doc, ref: image.id }]);
    });

    it('удаление без ссылающихся обычное, документ удаляется одним файлом', () => {
        const { p, doc } = setup();
        expect(p.remove(doc.id)).toEqual({ ok: true, dangling: [] });
        expect(p.find(doc.id)).toBeUndefined();
        expect(codeOf(() => p.remove(doc.id))).toBe('missing');
    });

    it('перенос и переименование: id тот же, ссылки целы, запись едет с ассетом', () => {
        const { p, image, doc } = setup();
        p.move(image.id, 'textures/boom.jpg');
        expect(p.find(image.id)).toMatchObject({ path: 'textures/boom.jpg', metaPath: 'textures/boom.jpg.meta.json' });
        expect(p.files.has('assets/explosion.jpg')).toBe(false);
        expect(p.files.has('assets/explosion.jpg.meta.json')).toBe(false);
        expect(p.dangling()).toEqual([]);
        expect(p.referrers(image.id).map((r) => r.id)).toEqual([doc.id]);
        expect(p.problems).toEqual([]);

        p.move(doc.id, 'fx/boom.flipbook.json');
        expect(p.find(doc.id)?.path).toBe('fx/boom.flipbook.json');
        expect(p.readDoc(doc.id)!.body.image).toBe(image.id);
    });

    it('перенос: отказы ничего не ломают', () => {
        const { p, image, doc } = setup();
        p.addAsset('other.jpg', PNG);
        p.files.write('stray.png.meta.json', '{}'); // чужая запись на пути, куда запись ассета поедет
        expect(codeOf(() => p.move(image.id, 'other.jpg'))).toBe('pathTaken');
        expect(codeOf(() => p.move(image.id, 'stray.png'))).toBe('pathTaken');
        expect(codeOf(() => p.move(image.id, 'boom.gif'))).toBe('no error'); // gif тоже картинка
        p.move(image.id, 'explosion.jpg');
        expect(codeOf(() => p.move(image.id, 'explosion.txt'))).toBe('wrongExtension');
        expect(codeOf(() => p.move(doc.id, 'doc.txt'))).toBe('wrongExtension');
        expect(codeOf(() => p.move(doc.id, 'doc.meta.json'))).toBe('wrongExtension');
        expect(codeOf(() => p.move('нет', 'x.png'))).toBe('missing');
        expect(p.find(image.id)?.path).toBe('explosion.jpg');
    });

    it('если запись не смогла переехать, ассет остаётся на старом месте вместе с ней', () => {
        const { p, image } = setup();
        const tooLongForMeta = ['x'.repeat(100), 'y'.repeat(100), 'z'.repeat(100), 'w'.repeat(100), 'v'.repeat(104) + '.png'].join('/'); // сам файл 512 знаков, с записью больше
        expect(codeOf(() => p.move(image.id, tooLongForMeta))).toBe('path:tooLong');
        expect(p.find(image.id)).toMatchObject({ path: 'assets/explosion.jpg', metaPath: 'assets/explosion.jpg.meta.json' });
        expect(p.files.has(tooLongForMeta)).toBe(false);
        expect(p.problems).toEqual([]);
    });

    it('смена регистра в имени проходит как перенос того же файла', () => {
        const { p, image } = setup();
        p.move(image.id, 'Assets/Explosion.JPG');
        expect(p.find(image.id)?.path).toBe('Assets/Explosion.JPG');
        expect(p.problems).toEqual([]);
    });

    it('ресурсы пересчитываются после любых изменений файлов', () => {
        const { p, image } = setup();
        expect(p.resources).toHaveLength(2);
        p.files.delete('assets/explosion.jpg.meta.json'); // убрали запись руками, мимо проекта
        expect(p.find(image.id)).toBeUndefined();
        expect(problemCodes(p)).toContain('missingMeta:assets/explosion.jpg');
    });
});
