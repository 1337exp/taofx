import { describe, expect, it } from 'vitest';
import { createFiles, FileError, type FileChange } from '../src/project/files';
import { PathError } from '../src/project/paths';

const code = (fn: () => void) => {
    try {
        fn();
    } catch (e) {
        return e instanceof FileError ? e.code : e instanceof PathError ? `path:${e.problem}` : 'other';
    }
    return 'no error';
};

describe('файлы проекта в памяти', () => {
    it('запись, чтение, текст', () => {
        const f = createFiles();
        f.write('a/b.txt', 'привет');
        f.write('a/c.bin', Uint8Array.of(1, 2, 3));
        expect(f.text('a/b.txt')).toBe('привет');
        expect([...f.read('a/c.bin')!]).toEqual([1, 2, 3]);
        expect(f.size).toBe(2);
        expect(f.read('нет')).toBeUndefined();
    });

    it('поиск без учёта регистра, а хранится как записали', () => {
        const f = createFiles([['Assets/Hero.PNG', 'x']]);
        expect(f.has('assets/hero.png')).toBe(true);
        expect(f.find('ASSETS/HERO.png')).toBe('Assets/Hero.PNG');
        expect(f.paths()).toEqual(['Assets/Hero.PNG']);
    });

    it('запись под другим регистром это ошибка, под тем же путём заменяет', () => {
        const f = createFiles([['A.png', '1']]);
        expect(code(() => f.write('a.png', '2'))).toBe('caseConflict');
        f.write('A.png', '3');
        expect(f.text('A.png')).toBe('3');
        expect(f.size).toBe(1);
    });

    it('плохой путь не пускает', () => {
        const f = createFiles();
        expect(code(() => f.write('../x', '1'))).toBe('path:dots');
        expect(code(() => createFiles([['a\\b', '1']]))).toBe('path:backslash');
    });

    it('файл не бывает папкой и внутри файла', () => {
        const f = createFiles([['a/b.txt', '1']]);
        expect(code(() => f.write('a', '2'))).toBe('isFolder');
        expect(code(() => f.write('a/b.txt/c', '2'))).toBe('fileInPath');
        expect(code(() => createFiles([['a', '1'], ['a/b', '2']]))).toBe('fileInPath');
    });

    it('delete', () => {
        const f = createFiles([['a.txt', '1']]);
        expect(f.delete('A.TXT')).toBe(true);
        expect(f.delete('a.txt')).toBe(false);
        expect(f.size).toBe(0);
    });

    it('move: перенос, занятый путь, смена регистра', () => {
        const f = createFiles([
            ['a.txt', '1'],
            ['b.txt', '2'],
        ]);
        expect(code(() => f.move('a.txt', 'B.txt'))).toBe('exists');
        expect(code(() => f.move('нет.txt', 'c.txt'))).toBe('missing');
        f.move('a.txt', 'dir/a.txt');
        expect(f.has('a.txt')).toBe(false);
        expect(f.text('dir/a.txt')).toBe('1');
        f.move('dir/a.txt', 'DIR/A.txt'); // только регистр
        expect(f.paths()).toEqual(['DIR/A.txt', 'b.txt']); // порядок по кодам знаков: заглавные раньше
        f.move('b.txt', 'b.txt'); // сам в себя: ничего
    });

    it('move на папку и в файл тоже запрещён, а прежнее место не страдает', () => {
        const f = createFiles([
            ['a/x.txt', '1'],
            ['b.txt', '2'],
        ]);
        expect(code(() => f.move('b.txt', 'a'))).toBe('isFolder');
        expect(code(() => f.move('b.txt', 'a/x.txt/y'))).toBe('fileInPath');
        expect(f.text('b.txt')).toBe('2');
    });

    it('paths: сортировка и папка-префикс', () => {
        const f = createFiles([
            ['b/2.txt', ''],
            ['a/1.txt', ''],
            ['a/sub/3.txt', ''],
            ['ab/4.txt', ''],
        ]);
        expect(f.paths()).toEqual(['a/1.txt', 'a/sub/3.txt', 'ab/4.txt', 'b/2.txt']);
        expect(f.paths('a')).toEqual(['a/1.txt', 'a/sub/3.txt']);
        expect(f.paths('A/')).toEqual(['a/1.txt', 'a/sub/3.txt']);
        expect(f.paths('нет')).toEqual([]);
    });

    it('ревизия и события на каждое изменение, а не на пустую попытку', () => {
        const f = createFiles();
        const log: FileChange[] = [];
        const off = f.subscribe((c) => log.push(c));
        const r0 = f.revision;
        f.write('a', '1');
        f.move('a', 'b');
        f.delete('b');
        f.delete('b'); // нечего удалять
        expect(f.revision).toBe(r0 + 3);
        expect(log).toEqual([
            { kind: 'write', path: 'a' },
            { kind: 'move', path: 'b', from: 'a' },
            { kind: 'delete', path: 'b' },
        ]);
        off();
        f.write('c', '1');
        expect(log).toHaveLength(3);
    });
});
