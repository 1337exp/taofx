import { evalGradient } from '@/particles/curve';
import type { Curve, CurvePoint, GradientStop } from '@/particles/types';

// Операции над точками кривой живут в taoux (их использует и сам виджет); здесь они же для остального редактора.
export { addPoint, clampTo, movePoint, niceStep, removePoint, roundTo, snapTo, ticks, valueBounds } from '@1337exp/taoux/curveeditor';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Кривая как список точек: число превращается в плоскую линию от 0 до 1. */
export function toPoints(curve: Curve): CurvePoint[] {
    return typeof curve === 'number' ? [{ t: 0, v: curve }, { t: 1, v: curve }] : curve.map((p) => ({ ...p }));
}

/** Кривые совпадают по значению (число и плоская линия из двух точек считаются разными: так хранится в файле). */
export function sameCurve(a: Curve, b: Curve): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

//--------------------------------------------------
// Градиент

/** Сдвигает остановку `i` по t в пределах соседей. */
export function moveStop(stops: readonly GradientStop[], i: number, t: number): GradientStop[] {
    const next = stops.map((s) => ({ ...s, color: [...s.color] as GradientStop['color'] }));
    const lo = i > 0 ? next[i - 1]!.t : 0;
    const hi = i < next.length - 1 ? next[i + 1]!.t : 1;
    next[i] = { ...next[i]!, t: Math.min(hi, Math.max(lo, clamp01(t))) };
    return next;
}

/** Добавляет остановку в `t` с цветом, который градиент имеет в этой точке; возвращает новый список и индекс. */
export function addStop(stops: readonly GradientStop[], t: number): { stops: GradientStop[]; index: number } {
    const x = clamp01(t);
    const [r, g, b, a] = evalGradient(stops, x);
    const next = stops.map((s) => ({ ...s, color: [...s.color] as GradientStop['color'] }));
    const at = next.findIndex((s) => s.t > x);
    const index = at === -1 ? next.length : at;
    next.splice(index, 0, { t: x, color: [r, g, b], alpha: a });
    return { stops: next, index };
}

/** Убирает остановку; последнюю не убирает. */
export function removeStop(stops: readonly GradientStop[], i: number): GradientStop[] {
    if (stops.length <= 1) return stops.map((s) => ({ ...s, color: [...s.color] as GradientStop['color'] }));
    return stops.filter((_, k) => k !== i).map((s) => ({ ...s, color: [...s.color] as GradientStop['color'] }));
}

/** CSS-градиент для полосы предпросмотра (цвет линейный переводится в sRGB, альфа остаётся). */
export function gradientCss(stops: readonly GradientStop[]): string {
    const srgb = (c: number) => Math.round(255 * (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(Math.min(1, Math.max(0, c)), 1 / 2.4) - 0.055));
    const parts = stops.map((s) => `rgba(${srgb(s.color[0])}, ${srgb(s.color[1])}, ${srgb(s.color[2])}, ${s.alpha.toFixed(3)}) ${(s.t * 100).toFixed(1)}%`);
    return `linear-gradient(to right, ${parts.join(', ')})`;
}
