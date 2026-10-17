import type { Curve, CurvePoint } from '@/particles/types';

// Кривая в файле частицы бывает числом (постоянная) или списком точек; операции над самими точками, градиентом и числами
// живут в taoux (`curveeditor`, `gradienteditor`, `num`) и импортируются оттуда напрямую.

/** Кривая как список точек: число превращается в плоскую линию от 0 до 1. */
export function toPoints(curve: Curve): CurvePoint[] {
    return typeof curve === 'number' ? [{ t: 0, v: curve }, { t: 1, v: curve }] : curve.map((p) => ({ ...p }));
}

/** Кривые совпадают по значению (число и плоская линия из двух точек считаются разными: так хранится в файле). */
export function sameCurve(a: Curve, b: Curve): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}
