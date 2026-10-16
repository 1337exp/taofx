import { describe, expect, it } from 'vitest';
import { addPoint, addStop, gradientCss, movePoint, moveStop, removePoint, removeStop, toPoints, valueBounds } from '@/editor/curveOps';
import type { GradientStop } from '@/particles/types';

const pts = [{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: 0 }];

describe('кривая', () => {
    it('число становится плоской линией, точки копируются', () => {
        expect(toPoints(2)).toEqual([{ t: 0, v: 2 }, { t: 1, v: 2 }]);
        const copy = toPoints(pts);
        expect(copy).toEqual(pts);
        expect(copy[0]).not.toBe(pts[0]);
    });

    it('точка двигается по v свободно, а по t остаётся между соседями', () => {
        expect(movePoint(pts, 1, 0.8, 3)[1]).toEqual({ t: 0.8, v: 3 });
        expect(movePoint(pts, 1, 2, 0)[1]!.t).toBe(1); // упёрлась в соседа справа
        expect(movePoint(pts, 1, -1, 0)[1]!.t).toBe(0); // в соседа слева
        expect(movePoint(pts, 0, 0.9, 0)[0]!.t).toBe(0.5);
        expect(pts[1]).toEqual({ t: 0.5, v: 1 }); // исходный список не тронут
    });

    it('добавление берёт значение кривой в этой точке и сохраняет порядок', () => {
        const r = addPoint(pts, 0.25);
        expect(r.index).toBe(1);
        expect(r.points.map((p) => p.t)).toEqual([0, 0.25, 0.5, 1]);
        expect(r.points[1]!.v).toBeCloseTo(0.5);
        expect(addPoint(pts, 0.75, 9).points[2]).toEqual({ t: 0.75, v: 9 });
        expect(addPoint(pts, 5).index).toBe(3);
    });

    it('удаление не оставляет меньше двух точек', () => {
        expect(removePoint(pts, 1)).toEqual([{ t: 0, v: 0 }, { t: 1, v: 0 }]);
        expect(removePoint(removePoint(pts, 1), 0)).toHaveLength(2);
    });

    it('пределы значений: не уже 0…1 и с запасом сверху', () => {
        expect(valueBounds(pts)).toEqual({ min: 0, max: 1.1 });
        expect(valueBounds([{ t: 0, v: -2 }, { t: 1, v: 5 }])).toEqual({ min: -2, max: 5.5 });
    });
});

describe('градиент', () => {
    const stops: GradientStop[] = [{ t: 0, color: [1, 0, 0], alpha: 1 }, { t: 1, color: [0, 0, 1], alpha: 0 }];

    it('остановка двигается между соседями', () => {
        const three = addStop(stops, 0.5).stops;
        expect(moveStop(three, 1, 0.9)[1]!.t).toBe(0.9);
        expect(moveStop(three, 1, 2)[1]!.t).toBe(1);
        expect(moveStop(three, 1, -1)[1]!.t).toBe(0);
    });

    it('новая остановка получает цвет градиента в этой точке', () => {
        const r = addStop(stops, 0.5);
        expect(r.index).toBe(1);
        expect(r.stops[1]!.color[0]).toBeCloseTo(0.5);
        expect(r.stops[1]!.color[2]).toBeCloseTo(0.5);
        expect(r.stops[1]!.alpha).toBeCloseTo(0.5);
    });

    it('последнюю остановку убрать нельзя', () => {
        expect(removeStop(stops, 0)).toHaveLength(1);
        expect(removeStop(removeStop(stops, 0), 0)).toHaveLength(1);
    });

    it('CSS-градиент содержит остановки и альфу', () => {
        const css = gradientCss(stops);
        expect(css).toContain('linear-gradient(to right');
        expect(css).toContain('rgba(255, 0, 0, 1.000) 0.0%');
        expect(css).toContain('rgba(0, 0, 255, 0.000) 100.0%');
    });
});
