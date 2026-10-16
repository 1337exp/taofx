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

/**
 * Пределы значений для отрисовки: от 0 (или ниже минимума) до максимума с запасом, не уже чем 0…1.
 * Заданные `min`/`max` (границы поля) фиксируют вид: график не плывёт и не выходит за допустимое.
 */
export function valueBounds(points: readonly CurvePoint[], min?: number, max?: number): { min: number; max: number } {
    let lo = 0;
    let hi = 1;
    for (const p of points) {
        lo = Math.min(lo, p.v);
        hi = Math.max(hi, p.v);
    }
    const auto = { min: lo, max: hi === lo ? lo + 1 : hi * 1.1 };
    const a = min ?? auto.min;
    const b = max ?? auto.max;
    return b > a ? { min: a, max: b } : { min: a, max: a + 1 };
}

/** Шаг сетки «1, 2, 5 × 10ⁿ», при котором на отрезке `span` выходит около `target` делений. */
export function niceStep(span: number, target = 4): number {
    if (!(span > 0)) return 1;
    const raw = span / Math.max(1, target);
    const pow = Math.pow(10, Math.floor(Math.log10(raw)));
    const f = raw / pow;
    return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * pow;
}

/** Метки на отрезке lo…hi с шагом `step` (кратные шагу, без накопления ошибки float). */
export function ticks(lo: number, hi: number, step: number): number[] {
    const out: number[] = [];
    const first = Math.ceil(lo / step - 1e-9);
    const last = Math.floor(hi / step + 1e-9);
    for (let i = first; i <= last; i++) out.push(Math.round(i * step * 1e6) / 1e6 + 0); // + 0 убирает «-0»
    return out;
}

/** Прижимает x к ближайшему кратному `step`; шаг 0 или меньше оставляет значение как есть. */
export function snapTo(x: number, step: number): number {
    return step > 0 ? Math.round(Math.round(x / step) * step * 1e6) / 1e6 + 0 : x;
}

/** Обрезает до `digits` знаков после запятой; без `digits` значение остаётся как есть. */
export function roundTo(x: number, digits?: number): number {
    if (digits === undefined) return x;
    const k = Math.pow(10, Math.max(0, Math.floor(digits)));
    return Math.round(x * k) / k + 0;
}

/** Зажимает v в границы кривой; незаданная граница не ограничивает. */
export function clampTo(v: number, min?: number, max?: number): number {
    return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
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
