import { describe, expect, it } from 'vitest';
import { fromHex, parseNumber, partsOf, toHex, valueOfParts } from '@/editor/values';

describe('partsOf / valueOfParts', () => {
    it('число растягивается на все компоненты, недостающие компоненты нули', () => {
        expect(partsOf('float', 2)).toEqual([2]);
        expect(partsOf('vec3', 0.5)).toEqual([0.5, 0.5, 0.5]);
        expect(partsOf('vec3', [1, 2])).toEqual([1, 2, 0]);
        expect(partsOf('vec2', undefined)).toEqual([0, 0]);
        expect(partsOf('color', [1, 0.5, 0])).toEqual([1, 0.5, 0]);
        expect(partsOf('vec4', [1, 2, 3, 4, 5])).toEqual([1, 2, 3, 4]);
    });

    it('для хранения float это число, остальное массив нужной длины', () => {
        expect(valueOfParts('float', [3])).toBe(3);
        expect(valueOfParts('vec2', [1, 2, 3])).toEqual([1, 2]);
        expect(valueOfParts('color', [0, 1, 0])).toEqual([0, 1, 0]);
    });
});

describe('цвет ↔ hex', () => {
    it('круговой проход с точностью до 1/255', () => {
        const rgb = fromHex('#ff8000')!;
        expect(rgb[0]).toBe(1);
        expect(rgb[1]).toBeCloseTo(0.5, 1);
        expect(toHex(rgb)).toBe('#ff8000');
    });

    it('значения вне 0…1 обрезаются, не цвет возвращает null', () => {
        expect(toHex([2, -1, 0.5])).toBe('#ff0080');
        expect(toHex([])).toBe('#000000');
        expect(fromHex('red')).toBeNull();
        expect(fromHex('#fff')).toBeNull();
        expect(fromHex('#GGGGGG')).toBeNull();
    });
});

describe('parseNumber', () => {
    it('пустое и не число дают 0', () => {
        expect(parseNumber('1.5')).toBe(1.5);
        expect(parseNumber('-2')).toBe(-2);
        expect(parseNumber('')).toBe(0);
        expect(parseNumber('  ')).toBe(0);
        expect(parseNumber('abc')).toBe(0);
        expect(parseNumber('Infinity')).toBe(0);
    });
});
