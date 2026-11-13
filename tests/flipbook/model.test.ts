import { describe, expect, it } from 'vitest';
import { DEFAULT_KEY_HIGH, DEFAULT_KEY_LOW } from '../../src/flipbook/flipbook';
import { autoDetect, backgroundOf, DEFAULT_DETECT, DEFAULT_FPS, defaultKey, frameIndexAt, framesFor, isRgb, readBody, readDetect, readKey } from '../../src/flipbook/model';
import { art, blank } from './helpers/image';

describe('readDetect', () => {
    it('годные настройки принимаются как есть', () => {
        expect(readDetect({ mode: 'grid', cols: 3, rows: 2 })).toEqual({ mode: 'grid', cols: 3, rows: 2 });
        expect(readDetect({ mode: 'auto', color: [1, 2, 3], tolerance: 4, gap: 5, minSize: 6 })).toEqual({ mode: 'auto', color: [1, 2, 3], tolerance: 4, gap: 5, minSize: 6 });
    });

    it('лишние поля отбрасываются', () => {
        expect(readDetect({ mode: 'grid', cols: 1, rows: 1, extra: true })).toEqual({ mode: 'grid', cols: 1, rows: 1 });
        expect(readDetect({ mode: 'grid', cols: 1, rows: 3 })).toEqual({ mode: 'grid', cols: 1, rows: 3 }); // один столбец это годно
        expect(readDetect({ mode: 'grid', cols: 3, rows: 1 })).toEqual({ mode: 'grid', cols: 3, rows: 1 });
    });

    it('негодное заменяется сеткой 1×1, а не общей ссылкой', () => {
        for (const bad of [undefined, null, 5, [], {}, { mode: 'grid' }, { mode: 'grid', cols: 0, rows: 1 }, { mode: 'grid', cols: 1, rows: 0 }, { mode: 'grid', cols: 1.5, rows: 1 }, { mode: 'grid', cols: 1, rows: 1.5 }, { mode: 'grid', cols: '2', rows: 1 }]) {
            expect(readDetect(bad)).toEqual(DEFAULT_DETECT);
        }
        expect(readDetect(undefined)).not.toBe(DEFAULT_DETECT);
        const auto = { mode: 'auto', color: [1, 2, 3], tolerance: 4, gap: 5, minSize: 6 };
        for (const bad of [{ ...auto, color: [1, 2] }, { ...auto, color: [1, 2, 256] }, { ...auto, color: [1, 2, -1] }, { ...auto, color: [1, 2, 3.5] }, { ...auto, tolerance: NaN }, { ...auto, gap: '1' }, { ...auto, minSize: undefined }, { ...auto, mode: 'other' }]) {
            expect(readDetect(bad)).toEqual(DEFAULT_DETECT);
        }
    });
});

describe('readKey, isRgb', () => {
    it('ключ фона читается или null', () => {
        expect(readKey({ color: [1, 2, 3], low: 4, high: 5 })).toEqual({ color: [1, 2, 3], low: 4, high: 5 });
        expect(readKey({ color: [1, 2, 3], low: 4, high: 5, more: 1 })).toEqual({ color: [1, 2, 3], low: 4, high: 5 });
        for (const bad of [undefined, null, 1, {}, { color: [1, 2, 3], low: 4 }, { color: [1, 2, 3], high: 4 }, { color: [999, 0, 0], low: 1, high: 2 }, { color: [1, 2, 3], low: NaN, high: 2 }]) {
            expect(readKey(bad)).toBeNull();
        }
    });

    it('цвет: три целых от 0 до 255', () => {
        expect(isRgb([0, 128, 255])).toBe(true);
        expect(isRgb([0, 0])).toBe(false);
        expect(isRgb([0, 0, 0, 0])).toBe(false);
        expect(isRgb([0, 0, 256])).toBe(false);
        expect(isRgb([-1, 0, 0])).toBe(false);
        expect(isRgb([0, 0.5, 0])).toBe(false);
        expect(isRgb('abc')).toBe(false);
    });
});

describe('readBody', () => {
    it('полное тело читается, кадры копируются без лишних полей', () => {
        const raw = { image: 'abc', frames: [{ x: 1, y: 2, w: 3, h: 4, junk: 1 }], fps: 8, detect: { mode: 'grid', cols: 2, rows: 1 }, key: { color: [9, 9, 9], low: 1, high: 2 } };
        const body = readBody(raw);
        expect(body).toEqual({ image: 'abc', frames: [{ x: 1, y: 2, w: 3, h: 4 }], fps: 8, detect: { mode: 'grid', cols: 2, rows: 1 }, key: { color: [9, 9, 9], low: 1, high: 2 } });
        expect(body.frames[0]).not.toBe(raw.frames[0]);
    });

    it('старое тело без настроек: значения по умолчанию', () => {
        expect(readBody({ image: '', frames: [], fps: 12 })).toEqual({ image: '', frames: [], fps: 12, detect: DEFAULT_DETECT, key: null });
        expect(readBody({})).toEqual({ image: '', frames: [], fps: DEFAULT_FPS, detect: DEFAULT_DETECT, key: null });
        expect(readBody({ image: 5, frames: 'x', fps: -1 })).toMatchObject({ image: '', frames: [], fps: DEFAULT_FPS });
        expect(readBody({ fps: 0 }).fps).toBe(DEFAULT_FPS);
        expect(readBody({ fps: Infinity }).fps).toBe(DEFAULT_FPS);
    });
});

describe('defaultKey', () => {
    it('мягкий переход по умолчанию', () => {
        expect(defaultKey([1, 2, 3])).toEqual({ color: [1, 2, 3], low: DEFAULT_KEY_LOW, high: DEFAULT_KEY_HIGH });
    });
});

describe('frameIndexAt', () => {
    it('кадры сменяются с частотой fps и идут по кругу', () => {
        expect(frameIndexAt(4, 10, 0)).toBe(0);
        expect(frameIndexAt(4, 10, 0.099)).toBe(0);
        expect(frameIndexAt(4, 10, 0.1)).toBe(1);
        expect(frameIndexAt(4, 10, 0.35)).toBe(3);
        expect(frameIndexAt(4, 10, 0.4)).toBe(0);
        expect(frameIndexAt(4, 10, 1.25)).toBe(0); // 12 кадров из 4: ровно оборот
        expect(frameIndexAt(3, 10, 1.1)).toBe(2);
    });

    it('нет кадров: -1; негодное время или частота: первый кадр', () => {
        expect(frameIndexAt(0, 10, 1)).toBe(-1);
        expect(frameIndexAt(-2, 10, 1)).toBe(-1);
        expect(frameIndexAt(NaN, 10, 1)).toBe(-1);
        expect(frameIndexAt(4, 0, 1)).toBe(0);
        expect(frameIndexAt(4, -1, 1)).toBe(0);
        expect(frameIndexAt(4, 10, -1)).toBe(0);
        expect(frameIndexAt(4, 10, NaN)).toBe(0);
        expect(frameIndexAt(4, 10, Infinity)).toBe(0);
    });
});

describe('framesFor', () => {
    const BG = [63, 51, 63, 255] as const;
    const RED = [255, 0, 0, 255] as const;

    it('сетка и поиск по фону дают разные кадры одной картинки', () => {
        const image = art(['##..##', '##..##'], { '#': RED }, BG);
        expect(framesFor({ mode: 'grid', cols: 2, rows: 1 }, image)).toEqual([
            { x: 0, y: 0, w: 3, h: 2 },
            { x: 3, y: 0, w: 3, h: 2 },
        ]);
        expect(framesFor({ mode: 'auto', color: [63, 51, 63], tolerance: 2, gap: 0, minSize: 1 }, image)).toEqual([
            { x: 0, y: 0, w: 2, h: 2 },
            { x: 4, y: 0, w: 2, h: 2 },
        ]);
    });

    it('настройки поиска по фону передаются: зазор склеивает, минимальный размер отсекает', () => {
        const image = art(['#...#', '.....', '.....', '.....', '..###', '..###'], { '#': RED }, BG);
        const base = { mode: 'auto', color: [63, 51, 63], tolerance: 2, gap: 0, minSize: 1 } as const;
        expect(framesFor(base, image)).toHaveLength(3);
        expect(framesFor({ ...base, minSize: 2 }, image)).toHaveLength(1);
        expect(framesFor({ ...base, gap: 2 }, image)).toHaveLength(3); // между кадрами три пустых пикселя
        expect(framesFor({ ...base, gap: 3 }, image)).toHaveLength(1);
    });
});

describe('backgroundOf, autoDetect', () => {
    it('цвет, занявший границу, это фон', () => {
        expect(backgroundOf(art(['...', '.#.', '...'], {}, [10, 20, 30, 255]))).toEqual([10, 20, 30]);
    });

    it('граница одного цвета важнее левого верхнего пикселя', () => {
        const image = art(['#..', '...', '...'], { '#': [200, 0, 0, 255] }, [10, 20, 30, 255]);
        expect(backgroundOf(image)).toEqual([10, 20, 30]);
    });

    it('шумная граница: цвет левого верхнего пикселя; пустая картинка: чёрный', () => {
        const image = blank(3, 1);
        (image.data as Uint8ClampedArray).set([1, 2, 3, 255, 4, 5, 6, 255, 7, 8, 9, 255]);
        expect(backgroundOf(image)).toEqual([1, 2, 3]);
        expect(backgroundOf({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toEqual([0, 0, 0]);
    });

    it('настройки поиска по фону: допуск и минимальный размер против мусора', () => {
        expect(autoDetect([1, 2, 3])).toEqual({ mode: 'auto', color: [1, 2, 3], tolerance: 4, gap: 8, minSize: 8 });
    });
});
