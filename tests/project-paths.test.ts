import { describe, expect, it } from 'vitest';
import { ID_LENGTH, isId, newId } from '../src/project/ids';
import { assertPath, basename, dirname, extname, join, MAX_PATH, MAX_SEGMENT, pathKey, PathError, pathProblem, stem, uniquePath } from '../src/project/paths';

describe('пути проекта', () => {
    it('годные пути', () => {
        for (const p of ['a', 'assets/explosion.jpg', 'эффекты/взрыв.fx.json', 'a b/c d.png', '.editor/state.json', 'a.b.c']) {
            expect(pathProblem(p), p).toBeNull();
        }
    });

    it('негодные пути и причины', () => {
        const cases: [string, string][] = [
            ['', 'empty'],
            ['/etc/x', 'absolute'],
            ['a\\b', 'backslash'],
            ['a/\x00b', 'control'],
            ['a//b', 'emptySegment'],
            ['a/', 'emptySegment'],
            ['a/../b', 'dots'],
            ['./a', 'dots'],
            ['a/b?.png', 'badChar'],
            ['C:/x', 'badChar'],
            ['a /b', 'trailing'],
            ['a/b.', 'trailing'],
            ['con', 'reserved'],
            ['assets/NUL.txt', 'reserved'],
            ['x'.repeat(MAX_SEGMENT + 1), 'segmentTooLong'],
            [('a/'.repeat(MAX_PATH / 2) + 'a').slice(0, MAX_PATH + 1), 'tooLong'],
        ];
        for (const [path, problem] of cases) expect(pathProblem(path), JSON.stringify(path)).toBe(problem);
    });

    it('имя вроде con2 или xcon не зарезервировано', () => {
        expect(pathProblem('con2')).toBeNull();
        expect(pathProblem('xcon.txt')).toBeNull();
        expect(pathProblem('a.con')).toBeNull();
    });

    it('assertPath бросает PathError с причиной', () => {
        expect(assertPath('a/b')).toBe('a/b');
        try {
            assertPath('../x');
            expect.unreachable();
        } catch (e) {
            expect(e).toBeInstanceOf(PathError);
            expect((e as PathError).problem).toBe('dots');
        }
    });

    it('ключ не различает регистр и вид Юникода', () => {
        expect(pathKey('Assets/A.PNG')).toBe(pathKey('assets/a.png'));
        expect(pathKey('\u00e9')).toBe(pathKey('e\u0301')); // é одним знаком и с комбинирующим акцентом
    });

    it('разбор пути', () => {
        expect(dirname('a/b/c.png')).toBe('a/b');
        expect(dirname('c.png')).toBe('');
        expect(basename('a/b/c.png')).toBe('c.png');
        expect(extname('a/b/c.tar.gz')).toBe('.gz');
        expect(extname('a/.gitignore')).toBe('');
        expect(extname('a.d/file')).toBe('');
        expect(stem('a/b/c.fx.json')).toBe('c.fx');
        expect(join('a', '', 'b.png')).toBe('a/b.png');
    });

    it('uniquePath ставит номер перед расширением', () => {
        const taken = new Set(['a/x.png', 'a/x 2.png']);
        expect(uniquePath('a/x.png', (p) => taken.has(p))).toBe('a/x 3.png');
        expect(uniquePath('a/y.png', (p) => taken.has(p))).toBe('a/y.png');
        expect(uniquePath('root', (p) => p === 'root')).toBe('root 2');
    });
});

describe('id ресурсов', () => {
    it('длина и набор знаков', () => {
        const id = newId();
        expect(id).toHaveLength(ID_LENGTH);
        expect(isId(id)).toBe(true);
        expect(id).toMatch(/^[a-km-np-tv-z2-9]+$/); // без 0 1 i l o u
    });

    it('не отдаёт занятые', () => {
        const seen: string[] = [];
        const id = newId((c) => {
            seen.push(c);
            return seen.length < 3;
        });
        expect(seen).toHaveLength(3);
        expect(id).toBe(seen[2]);
    });

    it('байты с перекосом отбрасываются: все знаки равновероятны', () => {
        // 240 и выше пропускаются (256 - 256 % 30); остальные дают знаки по кругу
        const bytes = [255, 250, 240, 0, 1, 29, 30, 239, 59, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
        const id = newId(undefined, () => Uint8Array.from(bytes));
        // годные: 0 1 29 30 239 59 2 3 4 5 → a b 9 a 9 9 c d e f
        expect(id).toBe('ab9a99cdef');
    });

    it('isId отвергает лишнее', () => {
        for (const v of ['', 'abc', 'ABCDEFGH', 'ab cdefgh', 'a'.repeat(33), 5, null, undefined]) expect(isId(v), String(v)).toBe(false);
        expect(isId('abcdef')).toBe(true);
    });
});
