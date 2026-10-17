/**
 * Детерминированный «случайный» источник без состояния: число зависит только от аргументов. Так одна и та же частица
 * получает одни и те же свойства при любой перемотке, на любой платформе (только целочисленные операции).
 */

const SEED = 0x9e3779b9;

/** Один шаг хэша: подмешивает целое `v` в состояние `h`. */
function step(h: number, v: number): number {
    h ^= (v | 0) + SEED + ((h << 6) | 0) + (h >>> 2);
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return h ^ (h >>> 16);
}

/** Хэш целых в 32 бита. */
export function hashInts(...values: number[]): number {
    let h = SEED;
    for (const v of values) h = step(h, v);
    return h >>> 0;
}

/** То же, что `hashInts(a, b, c, d, e)`, без массива аргументов: годится для горячих циклов. */
export function hash5(a: number, b: number, c: number, d: number, e: number): number {
    return step(step(step(step(step(SEED, a), b), c), d), e) >>> 0;
}

/** То же, что `hashInts(a, b, c, d)`. */
export function hash4(a: number, b: number, c: number, d: number): number {
    return step(step(step(step(SEED, a), b), c), d) >>> 0;
}

/** Число в [0, 1) из хэша. */
export const unit = (hash: number): number => hash / 4294967296;

/** Число в [0, 1) по ключам. */
export const rand01 = (...keys: number[]): number => unit(hashInts(...keys));
