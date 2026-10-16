/**
 * Детерминированный «случайный» источник без состояния: число зависит только от аргументов. Так одна и та же частица
 * получает одни и те же свойства при любой перемотке, на любой платформе (только целочисленные операции).
 */

/** Хэш целых в 32 бита. */
export function hashInts(...values: number[]): number {
    let h = 0x9e3779b9;
    for (const v of values) {
        h ^= (v | 0) + 0x9e3779b9 + ((h << 6) | 0) + (h >>> 2);
        h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
        h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
        h ^= h >>> 16;
    }
    return h >>> 0;
}

/** Число в [0, 1) из хэша. */
export const unit = (hash: number): number => hash / 4294967296;

/** Число в [0, 1) по ключам. */
export const rand01 = (...keys: number[]): number => unit(hashInts(...keys));
