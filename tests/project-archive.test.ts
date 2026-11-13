import { createZip } from '@1337exp/taoux/zip';
import { describe, expect, it } from 'vitest';
import { packProject, PROJECT_EXTENSION, unpackProject, type UnpackErrorCode } from '../src/project/archive';
import { createManifest, PROJECT_FILE, PROJECT_VERSION, serializeManifest } from '../src/project/manifest';
import { createProject } from '../src/project/project';

const text = (s: string) => new TextEncoder().encode(s);
const PNG = Uint8Array.from({ length: 300 }, (_, i) => (i * 13) & 255);
const manifest = (name = 'p') => text(serializeManifest(createManifest(name)));
const zipOf = (entries: Record<string, string | Uint8Array>) => createZip(Object.entries(entries).map(([name, data]) => ({ name, data: typeof data === 'string' ? text(data) : data })));
const errorOf = async (bytes: Uint8Array | Promise<Uint8Array>, options = {}) => {
    const r = await unpackProject(await bytes, options);
    return r.ok ? 'ok' : `${r.error}${r.detail ? ':' + r.detail : ''}`;
};

describe('файл проекта .taofx', () => {
    it('расширение', () => {
        expect(PROJECT_EXTENSION).toBe('.taofx');
    });

    it('собирается и открывается обратно: файлы, id, ссылки, «не сохранено» нет', async () => {
        const p = createProject({ name: 'Взрыв' });
        const image = p.addAsset('textures/sheet.png', PNG);
        const doc = p.addDoc('assets/boom.flipbook.json', 'flipbook', { image: image.id, frames: [{ x: 0, y: 0, w: 4, h: 4 }], fps: 8 });
        p.files.write('.editor/state.json', '{}');

        const bytes = await packProject(p);
        const r = await unpackProject(bytes);
        if (!r.ok) throw new Error(r.error);
        const back = r.project;

        expect(back.manifest.name).toBe('Взрыв');
        expect(back.dirty).toBe(false);
        expect(back.problems).toEqual([]);
        expect(back.resources.map((x) => [x.id, x.path]).sort()).toEqual([image, doc].map((x) => [x.id, x.path]).sort());
        expect(back.referrers(image.id).map((x) => x.id)).toEqual([doc.id]);
        expect([...back.files.read('textures/sheet.png')!]).toEqual([...PNG]);
        expect(back.files.has('.editor/state.json')).toBe(false); // состояние редактора в обмен не идёт
        expect(back.files.has(PROJECT_FILE)).toBe(true);
    });

    it('время файлов в архиве задаётся', async () => {
        const bytes = await packProject(createProject(), { date: new Date(2020, 5, 6, 12, 30, 40) });
        const view = new DataView(bytes.buffer);
        expect(view.getUint16(10, true)).toBe((12 << 11) | (30 << 5) | 20); // время локального заголовка первого файла
        expect(view.getUint16(12, true)).toBe(((2020 - 1980) << 9) | (6 << 5) | 6);
    });

    it('.editor едет по просьбе', async () => {
        const p = createProject();
        p.files.write('.editor/state.json', '{}');
        const r = await unpackProject(await packProject(p, { editor: true }));
        expect(r.ok && r.project.files.has('.editor/state.json')).toBe(true);
    });

    it('не архив, нет манифеста, битый и новый манифест', async () => {
        expect(await errorOf(text('{"format":"taofx"}'))).toBe('notZip');
        expect(await errorOf(zipOf({ 'a.png': PNG }))).toBe('noManifest');
        expect(await errorOf(zipOf({ [PROJECT_FILE]: '{' }))).toBe('invalidJson');
        expect(await errorOf(zipOf({ [PROJECT_FILE]: '{"format":"other"}' }))).toBe('notProject');
        expect(await errorOf(zipOf({ [PROJECT_FILE]: `{"format":"taofx-project","version":${PROJECT_VERSION + 1},"name":"x"}` }))).toBe('newerVersion');
        expect(await errorOf(zipOf({ [PROJECT_FILE]: '{"format":"taofx-project","version":1}' }))).toBe('invalidStructure');
    });

    it('пути, которые проект не принимает, отказ с названием пути', async () => {
        expect(await errorOf(zipOf({ [PROJECT_FILE]: manifest(), 'con.txt': 'x' }))).toBe('badPath:con.txt');
        expect(await errorOf(zipOf({ [PROJECT_FILE]: manifest(), 'A.png': PNG, 'a.png': PNG }))).toBe('badPath:a.png');
        expect(await errorOf(zipOf({ [PROJECT_FILE]: manifest(), 'a/b': 'x', 'a/b/c': 'y' }))).toBe('badPath:a/b/c');
    });

    it('ошибки и пределы zip доходят как есть', async () => {
        expect(await errorOf(zipOf({ [PROJECT_FILE]: manifest(), 'big.bin': new Uint8Array(1000) }), { limits: { maxEntryBytes: 500 } })).toBe('tooLarge:big.bin');
        expect(await errorOf(zipOf({ [PROJECT_FILE]: manifest(), 'a': 'x', 'b': 'y' }), { limits: { maxEntries: 2 } })).toBe('tooMany:3');
    });

    it('общая внешняя папка (так упаковывает проводник) и __MACOSX снимаются', async () => {
        const wrapped = await zipOf({ 'мой проект/project.json': manifest('Папка'), 'мой проект/a.png': PNG, '__MACOSX/мой проект/._a.png': 'junk' });
        const r = await unpackProject(wrapped);
        expect(r.ok && r.project.manifest.name).toBe('Папка');
        expect(r.ok && r.project.files.paths()).toEqual(['a.png', PROJECT_FILE]);
    });

    it('внешняя папка не снимается, если не всё лежит в ней', async () => {
        expect(await errorOf(zipOf({ 'a/project.json': manifest(), 'b.txt': 'x' }))).toBe('noManifest');
    });

    it('файлы без записей и чужие документы открываются с проблемами, не теряются', async () => {
        const r = await unpackProject(await zipOf({ [PROJECT_FILE]: manifest(), 'loose.png': PNG, 'old.json': '{"format":"taofx-particles","version":1}' }));
        if (!r.ok) throw new Error(r.error);
        expect(r.project.problems.map((x) => `${x.code}:${x.path}`).sort()).toEqual(['missingMeta:loose.png', 'unknownFormat:old.json']);
        expect(r.project.adopt()).toBe(1);
        expect(r.project.files.has('old.json')).toBe(true);
    });
});

describe('тексты отказов', () => {
    it('у каждой причины, которую показывает редактор, есть текст в обоих словарях', async () => {
        const { default: ru } = await import('../src/i18n/locales/ru');
        const { default: en } = await import('../src/i18n/locales/en');
        const codes = ['notZip', 'unsupported', 'corrupt', 'unsafeName', 'duplicate', 'tooMany', 'tooLarge', 'invalidJson', 'notProject', 'newerVersion', 'invalidStructure', 'noManifest', 'badPath', 'unreadable', 'notTaofxFile', 'unknownNode'] satisfies string[];
        const unpackCodes: UnpackErrorCode[] = ['notZip', 'unsupported', 'corrupt', 'unsafeName', 'duplicate', 'tooMany', 'tooLarge', 'invalidJson', 'notProject', 'newerVersion', 'invalidStructure', 'noManifest', 'badPath'];
        for (const code of unpackCodes) expect(codes).toContain(code);
        for (const code of codes) {
            expect((ru.file.error as Record<string, string>)[code], `ru ${code}`).toBeTruthy();
            expect((en.file.error as Record<string, string>)[code], `en ${code}`).toBeTruthy();
        }
    });
});
