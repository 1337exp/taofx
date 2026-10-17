import { evalCurve } from './curve';
import type { ParticleBuffers, TrailDef, Vec3 } from './types';

/** Куда смотрит камера, в координатах самой системы (меша, на который она повешена). */
export interface ViewPoint {
    position: Vec3;
    /** Единичный вектор взгляда. */
    forward: Vec3;
}

//--------------------------------------------------
// Сортировка по глубине

export interface Sorter {
    /** Глубины частиц: заполняет вызывающий (`keys[i]` для i < count), потом зовёт `sort`. */
    readonly keys: Float32Array;
    /** Порядок индексов от дальних к ближним (глубина по убыванию); массив принадлежит сортировщику и живёт до следующего вызова. */
    sort(count: number): Uint32Array;
}

/**
 * Поразрядная сортировка (3 прохода по 11 бит): устойчивая, без аллокаций и быстрее обычной сортировки на тысячах частиц.
 * Равные глубины идут в порядке рождения.
 */
export function createSorter(max: number): Sorter {
    const keys = new Float32Array(max);
    const bits = new Uint32Array(keys.buffer);
    let from = new Uint32Array(max);
    let to = new Uint32Array(max);
    const hist = new Uint32Array(2048);

    return {
        keys,
        sort(count) {
            for (let i = 0; i < count; i++) {
                // float в порядок целых: у отрицательных переворачиваем все биты, у остальных только знак; ~ даёт убывание
                const b = bits[i]!;
                bits[i] = ~(b & 0x80000000 ? ~b : b | 0x80000000) >>> 0;
                from[i] = i;
            }
            for (let shift = 0; shift < 33; shift += 11) {
                hist.fill(0);
                for (let i = 0; i < count; i++) hist[(bits[from[i]!]! >>> shift) & 2047]!++;
                let sum = 0;
                for (let b = 0; b < 2048; b++) {
                    const c = hist[b]!;
                    hist[b] = sum;
                    sum += c;
                }
                for (let i = 0; i < count; i++) {
                    const idx = from[i]!;
                    to[hist[(bits[idx]! >>> shift) & 2047]!++] = idx;
                }
                [from, to] = [to, from];
            }
            return from;
        },
    };
}

/** Глубина вдоль взгляда: чем больше, тем дальше от камеры. */
export function depthKeys(buffers: ParticleBuffers, count: number, view: ViewPoint, keys: Float32Array): void {
    const [cx, cy, cz] = view.position;
    const [fx, fy, fz] = view.forward;
    for (let i = 0; i < count; i++) {
        keys[i] = (buffers.pos[i * 3]! - cx) * fx + (buffers.pos[i * 3 + 1]! - cy) * fy + (buffers.pos[i * 3 + 2]! - cz) * fz;
    }
}

/** Переписывает частицы `src` в порядке `order` в `dst` (те же массивы, кроме шлейфа). */
export function gather(src: ParticleBuffers, dst: ParticleBuffers, order: Uint32Array, count: number): void {
    for (let i = 0; i < count; i++) {
        const s = order[i]!;
        dst.pos[i * 3] = src.pos[s * 3]!;
        dst.pos[i * 3 + 1] = src.pos[s * 3 + 1]!;
        dst.pos[i * 3 + 2] = src.pos[s * 3 + 2]!;
        dst.vel[i * 3] = src.vel[s * 3]!;
        dst.vel[i * 3 + 1] = src.vel[s * 3 + 1]!;
        dst.vel[i * 3 + 2] = src.vel[s * 3 + 2]!;
        dst.tint[i * 3] = src.tint[s * 3]!;
        dst.tint[i * 3 + 1] = src.tint[s * 3 + 1]!;
        dst.tint[i * 3 + 2] = src.tint[s * 3 + 2]!;
        dst.size[i] = src.size[s]!;
        dst.rot[i] = src.rot[s]!;
        dst.age[i] = src.age[s]!;
        dst.rand[i] = src.rand[s]!;
        dst.alpha[i] = src.alpha[s]!;
    }
}

//--------------------------------------------------
// Ленты и квадраты, собираемые на CPU (ленты везде, квадраты в PIXI)

/** Вершины и индексы для меша, собранного на CPU. На вершину: положение (2 или 3 числа), uv, данные частицы. */
export interface MeshBuffers {
    /** Размерность положения: 3 для three.js, 2 для PIXI. */
    dim: 2 | 3;
    /** Положение вершины. У ленты в 3D это точка пути (обе вершины пары совпадают): ширину и сторону добавляет вершинный шейдер. */
    position: Float32Array;
    /** Только лента в 3D: единичная касательная в точке пути (0, если путь вырожден). */
    tangent: Float32Array;
    /** Только лента в 3D: половина ширины в точке пути, мировые единицы. */
    width: Float32Array;
    uv: Float32Array;
    age: Float32Array;
    rand: Float32Array;
    tint: Float32Array;
    alpha: Float32Array;
    index: Uint32Array;
}

export function createMeshBuffers(vertices: number, indices: number, dim: 2 | 3, ribbon3d = false): MeshBuffers {
    return {
        dim,
        position: new Float32Array(vertices * dim),
        tangent: new Float32Array(ribbon3d ? vertices * 3 : 0),
        width: new Float32Array(ribbon3d ? vertices : 0),
        uv: new Float32Array(vertices * 2),
        age: new Float32Array(vertices),
        rand: new Float32Array(vertices),
        tint: new Float32Array(vertices * 3),
        alpha: new Float32Array(vertices),
        index: new Uint32Array(indices),
    };
}

/** Размеры буфера ленты на `max` частиц и `segments` отрезков. */
export const ribbonBuffers = (max: number, segments: number, dim: 2 | 3): MeshBuffers => createMeshBuffers(max * (segments + 1) * 2, max * segments * 6, dim, dim === 3);

/** Размеры буфера квадратов на `max` частиц. */
export const quadBuffers = (max: number, dim: 2 | 3): MeshBuffers => createMeshBuffers(max * 4, max * 6, dim);

/** Копирует данные частицы `i` на вершины `[v, v + n)`. */
function fillParticle(out: MeshBuffers, src: ParticleBuffers, i: number, v: number, n: number): void {
    for (let k = 0; k < n; k++) {
        out.age[v + k] = src.age[i]!;
        out.rand[v + k] = src.rand[i]!;
        out.alpha[v + k] = src.alpha[i]!;
        out.tint[(v + k) * 3] = src.tint[i * 3]!;
        out.tint[(v + k) * 3 + 1] = src.tint[i * 3 + 1]!;
        out.tint[(v + k) * 3 + 2] = src.tint[i * 3 + 2]!;
    }
}

export interface RibbonResult {
    vertices: number;
    indices: number;
}

/**
 * Лента-шлейф для 3D: на каждую точку пути две вершины с одним положением, касательной и половиной ширины
 * (размер частицы · кривая ширины). Развернуть полосу лицом к камере и разнести вершины на ширину делает вершинный шейдер:
 * боковой вектор = касательная × направление на камеру. Поэтому данные не зависят от камеры и готовы к загрузке сразу при расчёте.
 * uv.x = 1 у головы и 0 у конца (вдоль движения), uv.y = 0 и 1 поперёк. `order` задаёт порядок частиц (дальние первыми для сортировки).
 */
export function buildRibbon3D(src: ParticleBuffers, count: number, order: Uint32Array | null, trail: TrailDef, out: MeshBuffers): RibbonResult {
    const stride = src.trailStride;
    let v = 0;
    let ix = 0;
    for (let n = 0; n < count; n++) {
        const i = order ? order[n]! : n;
        const c = src.trailCount[i]!;
        if (c < 2) continue;
        const base = i * stride * 3;
        for (let j = 0; j < c; j++) {
            const p = base + j * 3;
            const a = base + Math.max(j - 1, 0) * 3;
            const b = base + Math.min(j + 1, c - 1) * 3;
            let tx = src.trailPos[a]! - src.trailPos[b]!;
            let ty = src.trailPos[a + 1]! - src.trailPos[b + 1]!;
            let tz = src.trailPos[a + 2]! - src.trailPos[b + 2]!;
            const len = Math.hypot(tx, ty, tz);
            if (len > 1e-9) {
                tx /= len;
                ty /= len;
                tz /= len;
            } else {
                tx = ty = tz = 0;
            }
            const u = src.trailU[i * stride + j]!;
            const w = 0.5 * src.size[i]! * evalCurve(trail.widthOverLength, u);
            for (let side = 0; side < 2; side++) {
                const k = v + j * 2 + side;
                out.position[k * 3] = src.trailPos[p]!;
                out.position[k * 3 + 1] = src.trailPos[p + 1]!;
                out.position[k * 3 + 2] = src.trailPos[p + 2]!;
                out.tangent[k * 3] = tx;
                out.tangent[k * 3 + 1] = ty;
                out.tangent[k * 3 + 2] = tz;
                out.width[k] = w;
                out.uv[k * 2] = 1 - u;
                out.uv[k * 2 + 1] = side;
            }
        }
        fillParticle(out, src, i, v, c * 2);
        for (let j = 0; j < c - 1; j++) {
            const a = v + j * 2;
            out.index[ix++] = a;
            out.index[ix++] = a + 1;
            out.index[ix++] = a + 2;
            out.index[ix++] = a + 1;
            out.index[ix++] = a + 3;
            out.index[ix++] = a + 2;
        }
        v += c * 2;
    }
    return { vertices: v, indices: ix };
}

/**
 * Лента для 2D (PIXI): то же, что `buildRibbon3D`, но в плоскости экрана. Координаты системы умножаются на `scale`,
 * ось Y переворачивается (в системе вверх, на экране вниз), боковой вектор перпендикулярен касательной.
 */
export function buildRibbon2D(src: ParticleBuffers, count: number, trail: TrailDef, scale: number, out: MeshBuffers): RibbonResult {
    const stride = src.trailStride;
    let v = 0;
    let ix = 0;
    for (let i = 0; i < count; i++) {
        const c = src.trailCount[i]!;
        if (c < 2) continue;
        const base = i * stride * 3;
        let sx = 0;
        let sy = 1;
        for (let j = 0; j < c; j++) {
            const p = base + j * 3;
            const x = src.trailPos[p]! * scale;
            const y = -src.trailPos[p + 1]! * scale;
            const a = base + Math.max(j - 1, 0) * 3;
            const b = base + Math.min(j + 1, c - 1) * 3;
            const tx = (src.trailPos[a]! - src.trailPos[b]!) * scale;
            const ty = -(src.trailPos[a + 1]! - src.trailPos[b + 1]!) * scale;
            const len = Math.hypot(tx, ty);
            if (len > 1e-9) {
                sx = -ty / len;
                sy = tx / len;
            }
            const u = src.trailU[i * stride + j]!;
            const w = 0.5 * src.size[i]! * scale * evalCurve(trail.widthOverLength, u);
            const o = (v + j * 2) * 2;
            out.position[o] = x - sx * w;
            out.position[o + 1] = y - sy * w;
            out.position[o + 2] = x + sx * w;
            out.position[o + 3] = y + sy * w;
            const t = (v + j * 2) * 2;
            out.uv[t] = out.uv[t + 2] = 1 - u;
            out.uv[t + 1] = 0;
            out.uv[t + 3] = 1;
        }
        fillParticle(out, src, i, v, c * 2);
        for (let j = 0; j < c - 1; j++) {
            const a = v + j * 2;
            out.index[ix++] = a;
            out.index[ix++] = a + 1;
            out.index[ix++] = a + 2;
            out.index[ix++] = a + 1;
            out.index[ix++] = a + 3;
            out.index[ix++] = a + 2;
        }
        v += c * 2;
    }
    return { vertices: v, indices: ix };
}

/**
 * Квадраты частиц для 2D (PIXI): повёрнутые (`billboard`) или вытянутые вдоль скорости (`stretch`). Координаты умножаются на `scale`,
 * ось Y переворачивается. uv.x идёт вдоль длинной стороны, как у квадрата в three.js.
 */
export function buildQuads2D(src: ParticleBuffers, count: number, stretch: number | null, scale: number, out: MeshBuffers): RibbonResult {
    for (let i = 0; i < count; i++) {
        const cx = src.pos[i * 3]! * scale;
        const cy = -src.pos[i * 3 + 1]! * scale;
        const size = src.size[i]! * scale;
        let length = size;
        let c: number;
        let s: number;
        if (stretch !== null) {
            const vx = src.vel[i * 3]!;
            const vy = -src.vel[i * 3 + 1]!;
            const v2 = Math.hypot(vx, vy);
            length = size * (1 + stretch * Math.hypot(v2, src.vel[i * 3 + 2]!));
            c = v2 > 1e-6 ? vx / v2 : 1;
            s = v2 > 1e-6 ? vy / v2 : 0;
        } else {
            // вращение в плоскости квадрата; Y экрана вниз, поэтому знак синуса обратный (как у квадрата в three.js)
            c = Math.cos(src.rot[i]!);
            s = -Math.sin(src.rot[i]!);
        }
        for (let k = 0; k < 4; k++) {
            const lx = CORNER_X[k]!;
            const ly = CORNER_Y[k]!;
            const o = (i * 4 + k) * 2;
            const px = lx * length;
            const py = -ly * size; // Y экрана вниз
            out.position[o] = cx + px * c - py * s;
            out.position[o + 1] = cy + px * s + py * c;
            out.uv[o] = lx + 0.5;
            out.uv[o + 1] = ly + 0.5;
        }
        fillParticle(out, src, i, i * 4, 4);
        const v = i * 4;
        const t = i * 6;
        out.index[t] = v;
        out.index[t + 1] = v + 1;
        out.index[t + 2] = v + 2;
        out.index[t + 3] = v;
        out.index[t + 4] = v + 2;
        out.index[t + 5] = v + 3;
    }
    return { vertices: count * 4, indices: count * 6 };
}

/** Углы квадрата в системе, где Y вверх: от нижнего левого против часовой. */
const CORNER_X = [-0.5, 0.5, 0.5, -0.5];
const CORNER_Y = [-0.5, -0.5, 0.5, 0.5];

//--------------------------------------------------
// Камера в координатах системы

/**
 * Положение и взгляд камеры в координатах объекта (меша системы) по их мировым матрицам (16 чисел по столбцам, как `Matrix4.elements`).
 * Результат пишется в `out` без аллокаций. Масштаб и поворот объекта учитываются; вырожденная матрица даёт камеру в нуле.
 */
export function viewInObject(cameraWorld: ArrayLike<number>, objectWorld: ArrayLike<number>, out: ViewPoint): ViewPoint {
    const m = objectWorld;
    // A: линейная часть (A[i][j] = m[i + 4j]), t: смещение
    const a = m[0]!;
    const b = m[4]!;
    const c = m[8]!;
    const d = m[1]!;
    const e = m[5]!;
    const f = m[9]!;
    const g = m[2]!;
    const h = m[6]!;
    const i = m[10]!;
    const c00 = e * i - f * h;
    const c01 = f * g - d * i;
    const c02 = d * h - e * g;
    const det = a * c00 + b * c01 + c * c02;
    if (Math.abs(det) < 1e-12) {
        out.position[0] = out.position[1] = out.position[2] = 0;
        out.forward[0] = 0;
        out.forward[1] = 0;
        out.forward[2] = -1;
        return out;
    }
    const k = 1 / det;
    // обратная матрица (по строкам)
    const r00 = c00 * k;
    const r01 = (c * h - b * i) * k;
    const r02 = (b * f - c * e) * k;
    const r10 = c01 * k;
    const r11 = (a * i - c * g) * k;
    const r12 = (c * d - a * f) * k;
    const r20 = c02 * k;
    const r21 = (b * g - a * h) * k;
    const r22 = (a * e - b * d) * k;

    const px = cameraWorld[12]! - m[12]!;
    const py = cameraWorld[13]! - m[13]!;
    const pz = cameraWorld[14]! - m[14]!;
    out.position[0] = r00 * px + r01 * py + r02 * pz;
    out.position[1] = r10 * px + r11 * py + r12 * pz;
    out.position[2] = r20 * px + r21 * py + r22 * pz;

    const fx = -cameraWorld[8]!;
    const fy = -cameraWorld[9]!;
    const fz = -cameraWorld[10]!;
    const lx = r00 * fx + r01 * fy + r02 * fz;
    const ly = r10 * fx + r11 * fy + r12 * fz;
    const lz = r20 * fx + r21 * fy + r22 * fz;
    const len = Math.hypot(lx, ly, lz) || 1;
    out.forward[0] = lx / len;
    out.forward[1] = ly / len;
    out.forward[2] = lz / len;
    return out;
}
