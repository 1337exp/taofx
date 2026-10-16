import type { Curve, CurvePoint } from '@/particles/types';

// Операции над точками кривой живут в taoux (их использует и сам виджет); здесь они же для остального редактора.
// То же с градиентом: остановки и CSS-полоса из taoux.
export { addStop, gradientCss, moveStop, patchStop, removeStop, roundAlpha, toLinear, toSrgb } from '@1337exp/taoux/gradienteditor';
export { addPoint, clampTo, movePoint, niceStep, removePoint, roundTo, snapTo, ticks, valueBounds } from '@1337exp/taoux/curveeditor';

/** Кривая как список точек: число превращается в плоскую линию от 0 до 1. */
export function toPoints(curve: Curve): CurvePoint[] {
    return typeof curve === 'number' ? [{ t: 0, v: curve }, { t: 1, v: curve }] : curve.map((p) => ({ ...p }));
}

/** Кривые совпадают по значению (число и плоская линия из двух точек считаются разными: так хранится в файле). */
export function sameCurve(a: Curve, b: Curve): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}
