import { describe, expect, it } from 'vitest';
import { addPoint, addStop, clampTo, gradientCss, movePoint, moveStop, niceStep, removePoint, removeStop, roundTo, sameCurve, snapTo, ticks, toPoints, valueBounds } from '@/editor/curveOps';
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

describe('сетка кривой', () => {
    it('шаг подбирается из 1, 2, 5 и ложится на отрезок', () => {
        expect(niceStep(1, 4)).toBe(0.2);
        expect(niceStep(10, 4)).toBe(2);
        expect(niceStep(0.3, 4)).toBe(0.1);
        expect(niceStep(0)).toBe(1);
    });

    it('метки кратны шагу и включают края', () => {
        expect(ticks(0, 1, 0.25)).toEqual([0, 0.25, 0.5, 0.75, 1]);
        expect(ticks(-0.1, 0.35, 0.1)).toEqual([-0.1, 0, 0.1, 0.2, 0.3]);
        expect(ticks(0, 0.3, 0.1)).toEqual([0, 0.1, 0.2, 0.3]);
    });

    it('прижатие и зажим', () => {
        expect(snapTo(0.123, 0.05)).toBe(0.1);
        expect(snapTo(0.126, 0.05)).toBe(0.15);
        expect(snapTo(0.123, 0)).toBe(0.123);
        expect(clampTo(-1, 0)).toBe(0);
        expect(clampTo(5, 0, 2)).toBe(2);
        expect(clampTo(5)).toBe(5);
    });

    it('границы поля фиксируют вид, пустые оставляют автоматику', () => {
        expect(valueBounds(pts, 0, 1)).toEqual({ min: 0, max: 1 });
        expect(valueBounds([{ t: 0, v: 0 }, { t: 1, v: 3 }], 0)).toEqual({ min: 0, max: 3.3000000000000003 });
        expect(valueBounds(pts, 2, 1)).toEqual({ min: 2, max: 3 });
    });

    it('сравнение кривых по значению', () => {
        expect(sameCurve(pts, toPoints(pts))).toBe(true);
        expect(sameCurve(1, [{ t: 0, v: 1 }, { t: 1, v: 1 }])).toBe(false);
    });
});

describe('обрезка знаков', () => {
    it('без digits ничего не трогает, с digits округляет', () => {
        expect(roundTo(0.123456)).toBe(0.123456);
        expect(roundTo(0.126, 2)).toBe(0.13);
        expect(roundTo(1.5, 0)).toBe(2);
        expect(roundTo(-0.001, 2)).toBe(0);
        expect(Object.is(roundTo(-0.001, 2), -0)).toBe(false);
    });
});
