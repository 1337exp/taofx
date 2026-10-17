import { hash4 } from './random';

/**
 * Шум значений в 3D с аналитической производной (квинтическая интерполяция): за один вызов значение и градиент.
 * Узлы решётки берутся из целочисленного хэша, поэтому поле одинаково на любой платформе и не зависит от истории.
 * Значения лежат в −1…1.
 */

/** Значение узла решётки (−1…1) для канала `channel` и seed. */
const lattice = (ix: number, iy: number, iz: number, channel: number, seed: number): number => hash4((Math.imul(ix, 73856093) + Math.imul(iy, 19349663)) | 0, Math.imul(iz, 83492791), channel, seed) / 2147483648 - 1;

const out = new Float64Array(4);

/**
 * Записывает в `out` значение шума (индекс 0) и его градиент (1…3) в точке (x, y, z).
 * Общий массив результата переиспользуется: вызывающий читает сразу, не храня ссылку.
 */
export function noise3(x: number, y: number, z: number, channel: number, seed: number): Float64Array {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fy = y - iy;
    const fz = z - iz;
    const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
    const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
    const uz = fz * fz * fz * (fz * (fz * 6 - 15) + 10);
    const dx = 30 * fx * fx * (fx - 1) * (fx - 1);
    const dy = 30 * fy * fy * (fy - 1) * (fy - 1);
    const dz = 30 * fz * fz * (fz - 1) * (fz - 1);

    const a = lattice(ix, iy, iz, channel, seed);
    const b = lattice(ix + 1, iy, iz, channel, seed);
    const c = lattice(ix, iy + 1, iz, channel, seed);
    const d = lattice(ix + 1, iy + 1, iz, channel, seed);
    const e = lattice(ix, iy, iz + 1, channel, seed);
    const f = lattice(ix + 1, iy, iz + 1, channel, seed);
    const g = lattice(ix, iy + 1, iz + 1, channel, seed);
    const h = lattice(ix + 1, iy + 1, iz + 1, channel, seed);

    const k1 = b - a;
    const k2 = c - a;
    const k3 = e - a;
    const k4 = a - b - c + d;
    const k5 = a - c - e + g;
    const k6 = a - b - e + f;
    const k7 = -a + b + c - d + e - f - g + h;

    out[0] = a + k1 * ux + k2 * uy + k3 * uz + k4 * ux * uy + k5 * uy * uz + k6 * uz * ux + k7 * ux * uy * uz;
    out[1] = dx * (k1 + k4 * uy + k6 * uz + k7 * uy * uz);
    out[2] = dy * (k2 + k5 * uz + k4 * ux + k7 * uz * ux);
    out[3] = dz * (k3 + k6 * ux + k5 * uy + k7 * ux * uy);
    return out;
}

/**
 * Ротор векторного потенциала из трёх независимых шумов: поле без дивергенции (частицы вьются, не скапливаясь и не растекаясь).
 * Записывает вектор в `res`, длина порядка 1.
 */
export function curl3(x: number, y: number, z: number, seed: number, res: Float64Array): void {
    // потенциал Ψ = (n1, n2, n3); ротор: (∂Ψ3/∂y − ∂Ψ2/∂z, ∂Ψ1/∂z − ∂Ψ3/∂x, ∂Ψ2/∂x − ∂Ψ1/∂y). noise3 отдаёт общий массив, читаем по очереди.
    const n1 = noise3(x, y, z, 1, seed);
    const y1 = n1[2]!;
    const z1 = n1[3]!;
    const n2 = noise3(x, y, z, 2, seed);
    const x2 = n2[1]!;
    const z2 = n2[3]!;
    const n3 = noise3(x, y, z, 3, seed);
    res[0] = n3[2]! - z2;
    res[1] = z1 - n3[1]!;
    res[2] = x2 - y1;
}
