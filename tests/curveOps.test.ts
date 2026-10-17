import { describe, expect, it } from 'vitest';
import { sameCurve, toPoints } from '@/editor/curveOps';

// Операции над точками, остановками и числами проверены в taoux (curveeditor, gradienteditor, num); здесь только то, что относится к формату частицы.
const pts = [{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: 0 }];

describe('кривая в файле частицы', () => {
    it('число становится плоской линией, точки копируются', () => {
        expect(toPoints(2)).toEqual([{ t: 0, v: 2 }, { t: 1, v: 2 }]);
        const copy = toPoints(pts);
        expect(copy).toEqual(pts);
        expect(copy[0]).not.toBe(pts[0]);
    });

    it('сравнение по значению: число и плоская линия из двух точек это разное', () => {
        expect(sameCurve(pts, toPoints(pts))).toBe(true);
        expect(sameCurve(1, [{ t: 0, v: 1 }, { t: 1, v: 1 }])).toBe(false);
        expect(sameCurve(2, 2)).toBe(true);
    });
});
