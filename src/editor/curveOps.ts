import { evalCurve, evalGradient } from '@/particles/curve';
import type { Curve, CurvePoint, GradientStop } from '@/particles/types';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Кривая как список точек: число превращается в плоскую линию от 0 до 1. */
export function toPoints(curve: Curve): CurvePoint[] {
    return typeof curve === 'number' ? [{ t: 0, v: curve }, { t: 1, v: curve }] : curve.map((p) => ({ ...p }));
}

/** Двигает точку `i`: по t она остаётся между соседями (порядок не нарушается), по v свободна. */
export function movePoint(points: readonly CurvePoint[], i: number, t: number, v: number): CurvePoint[] {
    const next = points.map((p) => ({ ...p }));
    const lo = i > 0 ? next[i - 1]!.t : 0;
    const hi = i < next.length - 1 ? next[i + 1]!.t : 1;
    next[i] = { t: Math.min(hi, Math.max(lo, clamp01(t))), v };
    return next;
}

/** Добавляет точку в `t` со значением `v` (по умолчанию значение кривой в этой точке); возвращает новый список и индекс точки. */
export function addPoint(points: readonly CurvePoint[], t: number, v?: number): { points: CurvePoint[]; index: number } {
    const x = clamp01(t);
    const next = points.map((p) => ({ ...p }));
    const at = next.findIndex((p) => p.t > x);
    const index = at === -1 ? next.length : at;
    next.splice(index, 0, { t: x, v: v ?? evalCurve(points as CurvePoint[], x) });
    return { points: next, index };
}

/** Убирает точку; меньше двух точек не оставляет (кривая из одной точки это просто число). */
export function removePoint(points: readonly CurvePoint[], i: number): CurvePoint[] {
    if (points.length <= 2) return points.map((p) => ({ ...p }));
    return points.filter((_, k) => k !== i).map((p) => ({ ...p }));
}

/** Пределы значений для отрисовки: от 0 (или ниже минимума) до максимума с запасом, не уже чем 0…1. */
export function valueBounds(points: readonly CurvePoint[]): { min: number; max: number } {
    let min = 0;
    let max = 1;
    for (const p of points) {
        min = Math.min(min, p.v);
        max = Math.max(max, p.v);
    }
    return { min, max: max === min ? min + 1 : max * 1.1 };
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
