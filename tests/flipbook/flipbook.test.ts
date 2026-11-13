import { describe, expect, it } from 'vitest';
import { autoFrames, bakeSheet, balancedGrid, gridFrames } from '../../src/flipbook/flipbook';
import type { ImageLike } from '../../src/flipbook/types';
import { art, blank, setPixel } from './helpers/image';

const px = (image: ImageLike, x: number, y: number) => [...image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 4)];

describe('balancedGrid', () => {
    it('самая квадратная сетка', () => {
        expect(balancedGrid(1)).toEqual([1, 1]);
        expect(balancedGrid(4)).toEqual([2, 2]);
        expect(balancedGrid(5)).toEqual([3, 2]);
        expect(balancedGrid(6)).toEqual([3, 2]);
        expect(balancedGrid(10)).toEqual([4, 3]);
        expect(balancedGrid(0)).toEqual([0, 0]);
        expect(balancedGrid(-3)).toEqual([0, 0]);
        expect(balancedGrid(NaN)).toEqual([0, 0]);
    });
});

describe('gridFrames', () => {
    it('равные кадры, слева направо и сверху вниз', () => {
        expect(gridFrames(10, 6, 2, 2)).toEqual([
            { x: 0, y: 0, w: 5, h: 3 },
            { x: 5, y: 0, w: 5, h: 3 },
            { x: 0, y: 3, w: 5, h: 3 },
            { x: 5, y: 3, w: 5, h: 3 },
        ]);
    });

    it('картинка не кратна сетке: кадры одного размера, остаток справа и снизу не используется', () => {
        expect(gridFrames(10, 7, 3, 2)).toEqual([
            { x: 0, y: 0, w: 3, h: 3 },
            { x: 3, y: 0, w: 3, h: 3 },
            { x: 6, y: 0, w: 3, h: 3 },
            { x: 0, y: 3, w: 3, h: 3 },
            { x: 3, y: 3, w: 3, h: 3 },
            { x: 6, y: 3, w: 3, h: 3 },
        ]);
    });

    it('негодная сетка: пусто', () => {
        expect(gridFrames(10, 10, 0, 2)).toEqual([]);
        expect(gridFrames(10, 10, 2, 0)).toEqual([]);
        expect(gridFrames(10, 10, 1.5, 2)).toEqual([]);
        expect(gridFrames(10, 10, 2, NaN)).toEqual([]);
        expect(gridFrames(3, 10, 4, 1)).toEqual([]); // кадр уже пикселя
        expect(gridFrames(10, 3, 1, 4)).toEqual([]);
        expect(gridFrames(10.5, 10, 2, 2)).toEqual([]);
        expect(gridFrames(10, 10.5, 2, 2)).toEqual([]);
        expect(gridFrames(10, 10, -1, 2)).toEqual([]);
    });

    it('один кадр на всю картинку', () => {
        expect(gridFrames(4, 3, 1, 1)).toEqual([{ x: 0, y: 0, w: 4, h: 3 }]);
        expect(gridFrames(4, 3, 4, 3)).toHaveLength(12);
    });
});

describe('autoFrames', () => {
    const BG = [63, 51, 63, 255] as const;
    const RED = [255, 0, 0, 255] as const;
    const sheet = art(['.##.......', '.##...###.', '......###.', '..#.......'], { '#': RED }, BG);

    it('кадры по фону в порядке чтения: строка за строкой, слева направо', () => {
        const frames = autoFrames(sheet, { color: [63, 51, 63], tolerance: 2 });
        expect(frames).toEqual([
            { x: 1, y: 0, w: 2, h: 2 },
            { x: 6, y: 1, w: 3, h: 2 },
            { x: 2, y: 3, w: 1, h: 1 },
        ]);
    });

    it('минимальный размер отсекает мусор', () => {
        expect(autoFrames(sheet, { color: [63, 51, 63], tolerance: 2, minSize: 2 })).toHaveLength(2);
    });

    it('зазор склеивает части одного кадра', () => {
        const two = art(['##...##'], { '#': RED }, BG);
        expect(autoFrames(two, { color: [63, 51, 63], tolerance: 2 })).toHaveLength(2);
        expect(autoFrames(two, { color: [63, 51, 63], tolerance: 2, gap: 3 })).toEqual([{ x: 0, y: 0, w: 7, h: 1 }]);
    });

    it('допуск: шумный фон JPEG всё равно фон', () => {
        const noisy = art(['..#..'], { '#': RED }, BG);
        setPixel(noisy, 0, 0, [65, 50, 62, 255]);
        expect(autoFrames(noisy, { color: [63, 51, 63], tolerance: 0 })).toHaveLength(2);
        expect(autoFrames(noisy, { color: [63, 51, 63], tolerance: 3 })).toHaveLength(1);
    });

    it('минимальный размер считается и по ширине, и по высоте отдельно', () => {
        const wide = art(['###'], { '#': RED }, BG); // 3×1
        const tall = art(['#', '#', '#'], { '#': RED }, BG); // 1×3
        const opts = { color: [63, 51, 63] as [number, number, number], tolerance: 2, minSize: 2 };
        expect(autoFrames(wide, opts)).toEqual([]);
        expect(autoFrames(tall, opts)).toEqual([]);
        expect(autoFrames(wide, { ...opts, minSize: 1 })).toHaveLength(1);
    });

    it('порядок чтения: кадры в одной строке идут слева направо, даже если правый начинается выше', () => {
        const image = art(['....#.', '.#..#.', '.#..#.', '.#....'], { '#': RED }, BG);
        expect(autoFrames(image, { color: [63, 51, 63], tolerance: 2 }).map((f) => f.x)).toEqual([1, 4]);
    });

    it('кадры не несут лишних полей', () => {
        expect(Object.keys(autoFrames(sheet, { color: [63, 51, 63], tolerance: 2 })[0]!).sort()).toEqual(['h', 'w', 'x', 'y']);
    });

    it('без видимых пикселей кадров нет', () => {
        expect(autoFrames(blank(4, 4), { color: [0, 0, 0], tolerance: 0 })).toEqual([]);
    });
});

describe('bakeSheet', () => {
    const A = [200, 0, 0, 255] as const;
    const B = [0, 200, 0, 255] as const;

    it('нет кадров или все пустые: пустой лист', () => {
        const none = { width: 0, height: 0, data: new Uint8ClampedArray(0), cols: 0, rows: 0, cell: 0 };
        expect(bakeSheet(blank(4, 4), [])).toEqual(none);
        expect(bakeSheet(blank(4, 4), [{ x: 9, y: 9, w: 3, h: 3 }])).toEqual(none);
    });

    it('ячейка: самый большой кадр и поле с обеих сторон; кадры по центру, не масштабируются', () => {
        const image = blank(10, 6);
        for (let x = 0; x < 4; x++) for (let y = 0; y < 2; y++) setPixel(image, x, y, A); // кадр 4×2
        for (let x = 5; x < 6; x++) for (let y = 0; y < 1; y++) setPixel(image, x, y, B); // кадр 1×1
        const sheet = bakeSheet(
            image,
            [
                { x: 0, y: 0, w: 4, h: 2 },
                { x: 5, y: 0, w: 1, h: 1 },
            ],
            { padding: 1, cols: 2 },
        );
        expect(sheet).toMatchObject({ cols: 2, rows: 1, cell: 6, width: 12, height: 6 });
        // первый кадр 4×2 в ячейке 6×6: x от 1, y от 2
        expect(px(sheet, 1, 2)).toEqual([...A]);
        expect(px(sheet, 4, 3)).toEqual([...A]);
        expect(px(sheet, 0, 2)).toEqual([0, 0, 0, 0]);
        expect(px(sheet, 5, 2)).toEqual([0, 0, 0, 0]);
        expect(px(sheet, 1, 1)).toEqual([0, 0, 0, 0]);
        expect(px(sheet, 1, 4)).toEqual([0, 0, 0, 0]);
        // второй 1×1: в ячейке 6×6 по центру со сдвигом вправо-вниз на лишний пиксель: x = 6 + floor(5/2) = 8
        expect(px(sheet, 8, 2)).toEqual([...B]);
        expect(px(sheet, 7, 2)).toEqual([0, 0, 0, 0]);
    });

    it('ячейка вмещает и высокий кадр: берётся большая из сторон', () => {
        const image = blank(2, 6, A);
        expect(bakeSheet(image, [{ x: 0, y: 0, w: 2, h: 6 }], { padding: 0 }).cell).toBe(6);
        expect(bakeSheet(image, [{ x: 0, y: 0, w: 2, h: 6 }], { padding: 0 })).toMatchObject({ width: 6, height: 6 });
    });

    it('поле по умолчанию 2 пикселя, отрицательное и дробное приводится', () => {
        const image = blank(2, 2, A);
        const frame = [{ x: 0, y: 0, w: 2, h: 2 }];
        expect(bakeSheet(image, frame).cell).toBe(6);
        expect(bakeSheet(image, frame, { padding: -5 }).cell).toBe(2);
        expect(bakeSheet(image, frame, { padding: 1.9 }).cell).toBe(4);
        expect(bakeSheet(image, frame, { padding: 0 }).cell).toBe(2);
    });

    it('сетка листа: самая квадратная, а `cols` задаёт столбцы', () => {
        const image = blank(4, 4, A);
        const five = Array.from({ length: 5 }, () => ({ x: 0, y: 0, w: 4, h: 4 }));
        expect(bakeSheet(image, five, { padding: 0 })).toMatchObject({ cols: 3, rows: 2, width: 12, height: 8 });
        expect(bakeSheet(image, five, { padding: 0, cols: 5 })).toMatchObject({ cols: 5, rows: 1 });
        expect(bakeSheet(image, five, { padding: 0, cols: 99 })).toMatchObject({ cols: 5, rows: 1 }); // больше кадров, чем столбцов не бывает
        expect(bakeSheet(image, five, { padding: 0, cols: 2 })).toMatchObject({ cols: 2, rows: 3 });
        expect(bakeSheet(image, five, { padding: 0, cols: 0 })).toMatchObject({ cols: 3 }); // негодное число столбцов: по умолчанию
    });

    it('кадры лежат в ячейках по порядку, строка за строкой', () => {
        const image = blank(2, 1);
        setPixel(image, 0, 0, A);
        setPixel(image, 1, 0, B);
        const frames = [
            { x: 0, y: 0, w: 1, h: 1 },
            { x: 1, y: 0, w: 1, h: 1 },
            { x: 0, y: 0, w: 1, h: 1 },
        ];
        const sheet = bakeSheet(image, frames, { padding: 0, cols: 2 });
        expect(px(sheet, 0, 0)).toEqual([...A]);
        expect(px(sheet, 1, 0)).toEqual([...B]);
        expect(px(sheet, 0, 1)).toEqual([...A]);
        expect(px(sheet, 1, 1)).toEqual([0, 0, 0, 0]);
    });

    it('кадр за пределами картинки обрезается по ней', () => {
        const image = blank(3, 3, A);
        const sheet = bakeSheet(image, [{ x: 2, y: 2, w: 5, h: 5 }], { padding: 0 });
        expect(sheet).toMatchObject({ cell: 1, width: 1, height: 1 });
        expect(px(sheet, 0, 0)).toEqual([...A]);
    });

    it('негодная картинка: ошибка', () => {
        expect(() => bakeSheet({ width: 2, height: 2, data: new Uint8ClampedArray(4) }, [{ x: 0, y: 0, w: 1, h: 1 }])).toThrow(RangeError);
    });

    describe('фон в альфу', () => {
        const BG = [63, 51, 63] as const;
        const key = { color: BG, low: 6, high: 34 };
        const frame = [{ x: 0, y: 0, w: 3, h: 1 }];

        it('фон прозрачный, далёкий цвет непрозрачный и цвет его сохранён', () => {
            const image = blank(3, 1, [63, 51, 63, 255]);
            setPixel(image, 2, 0, [255, 200, 100, 255]);
            const sheet = bakeSheet(image, frame, { padding: 0, key });
            // кадр 3×1 в ячейке 3×3: строка кадра лежит посередине (y = 1)
            expect(px(sheet, 0, 1)).toEqual([0, 0, 0, 0]);
            expect(px(sheet, 1, 1)).toEqual([0, 0, 0, 0]);
            expect(px(sheet, 2, 1)).toEqual([255, 200, 100, 255]);
        });

        it('край: прозрачность плавная, а цвет очищен от примеси фона', () => {
            const image = blank(1, 1);
            // пиксель посередине между фоном и цветом: расстояние 20 из диапазона 6…34, то есть t = 0.5 → a = 0.5
            const colorFull = [63 + 20, 51, 63] as const;
            setPixel(image, 0, 0, [colorFull[0], colorFull[1], colorFull[2], 255]);
            const [r, g, b, a] = px(bakeSheet(image, [{ x: 0, y: 0, w: 1, h: 1 }], { padding: 0, key }), 0, 0);
            const t = (20 - 6) / (34 - 6);
            const alpha = t * t * (3 - 2 * t);
            expect(a).toBe(Math.round(alpha * 255));
            expect(r).toBe(Math.round(63 + 20 / alpha));
            expect(g).toBe(51);
            expect(b).toBe(63);
        });

        it('прозрачность исходного пикселя сохраняется, а цвет прозрачного пикселя это фон: 0', () => {
            const image = blank(2, 1, [255, 0, 0, 128]);
            setPixel(image, 1, 0, [63, 51, 63, 255]);
            const sheet = bakeSheet(image, [{ x: 0, y: 0, w: 2, h: 1 }], { padding: 0, key });
            expect(px(sheet, 0, 0)).toEqual([255, 0, 0, 128]);
            expect(px(sheet, 1, 0)).toEqual([0, 0, 0, 0]);
        });

        it('пиксель почти цвета фона (в пределах нижнего порога) становится полностью пустым, цвет тоже', () => {
            const image = blank(1, 1, [65, 51, 63, 255]);
            expect(px(bakeSheet(image, [{ x: 0, y: 0, w: 1, h: 1 }], { padding: 0, key }), 0, 0)).toEqual([0, 0, 0, 0]);
        });

        it('без ключа пиксели копируются как есть, в том числе «фон»', () => {
            const image = blank(1, 1, [63, 51, 63, 255]);
            expect(px(bakeSheet(image, [{ x: 0, y: 0, w: 1, h: 1 }], { padding: 0 }), 0, 0)).toEqual([63, 51, 63, 255]);
        });

        it('жёсткий ключ (low = high): фон или не фон', () => {
            const image = blank(2, 1, [63, 51, 63, 255]);
            setPixel(image, 1, 0, [64, 51, 63, 255]);
            const sheet = bakeSheet(image, [{ x: 0, y: 0, w: 2, h: 1 }], { padding: 0, key: { color: BG, low: 0.5, high: 0.5 } });
            expect(px(sheet, 0, 0)[3]).toBe(0);
            expect(px(sheet, 1, 0)[3]).toBe(255);
        });
    });
});
