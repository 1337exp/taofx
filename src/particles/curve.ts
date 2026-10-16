import type { Curve, GradientStop, Range } from './types';

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);

/** Значение из диапазона по случайному u в [0, 1). */
export function sampleRange(range: Range, u: number): number {
    return typeof range === 'number' ? range : range[0] + (range[1] - range[0]) * u;
}

/** Наибольшее значение диапазона. */
export const rangeMax = (range: Range): number => (typeof range === 'number' ? range : Math.max(range[0], range[1]));

/** Значение кривой в точке t (0…1): вне крайних точек остаётся значением крайней, между ними линейно. */
export function evalCurve(curve: Curve, t: number): number {
    if (typeof curve === 'number') return curve;
    const n = curve.length;
    if (n === 0) return 1;
    const x = clamp01(t);
    if (x <= curve[0]!.t) return curve[0]!.v;
    if (x >= curve[n - 1]!.t) return curve[n - 1]!.v;
    for (let i = 1; i < n; i++) {
        const b = curve[i]!;
        if (x <= b.t) {
            const a = curve[i - 1]!;
            const span = b.t - a.t;
            return span <= 0 ? b.v : a.v + ((b.v - a.v) * (x - a.t)) / span;
        }
    }
    return curve[n - 1]!.v;
}

/** Цвет и непрозрачность градиента в точке t: записывает в `out` (rgb, затем alpha) и возвращает его. */
export function evalGradient(stops: readonly GradientStop[], t: number, out: [number, number, number, number] = [1, 1, 1, 1]): [number, number, number, number] {
    const n = stops.length;
    if (n === 0) {
        out[0] = out[1] = out[2] = out[3] = 1;
        return out;
    }
    const x = clamp01(t);
    let a = stops[0]!;
    let b = stops[0]!;
    let k = 0;
    if (x >= stops[n - 1]!.t) {
        a = b = stops[n - 1]!;
    } else if (x > stops[0]!.t) {
        for (let i = 1; i < n; i++) {
            if (x <= stops[i]!.t) {
                a = stops[i - 1]!;
                b = stops[i]!;
                const span = b.t - a.t;
                k = span <= 0 ? 1 : (x - a.t) / span;
                break;
            }
        }
    }
    out[0] = a.color[0] + (b.color[0] - a.color[0]) * k;
    out[1] = a.color[1] + (b.color[1] - a.color[1]) * k;
    out[2] = a.color[2] + (b.color[2] - a.color[2]) * k;
    out[3] = a.alpha + (b.alpha - a.alpha) * k;
    return out;
}
