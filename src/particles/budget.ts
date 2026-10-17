import { evalCurve, rangeMax } from './curve';
import { createBuffers, createSimulation, trailStrideOf } from './sim';
import type { ParticleBuffers, SystemDef, Vec3 } from './types';

/**
 * Камера для оценки заполнения. Размеры в пикселях нужны, чтобы перевести площадь частиц в «слои»: сколько раз в среднем
 * закрашивается каждый пиксель экрана (именно заполнение, а не число частиц, обычно решает производительность эффекта).
 */
export interface FillView {
    position: Vec3;
    /** Единичный вектор взгляда. */
    forward: Vec3;
    /** Размер экрана в пикселях. */
    width: number;
    height: number;
    /** Перспектива: пикселей высоты экрана на единицу длины на расстоянии 1 (`height / (2·tan(fov/2))`). Ортографическая камера: пикселей на единицу. */
    pixelsPerUnit: number;
    ortho?: boolean;
}

/** Масштаб «единиц сцены в пиксели» на глубине `z`. */
const scaleAt = (view: FillView, z: number): number => (view.ortho ? view.pixelsPerUnit : view.pixelsPerUnit / z);

/**
 * Заполнение: суммарная площадь частиц на экране в пикселях, делённая на площадь экрана. Это число слоёв перекрытия
 * (3 значит «каждый пиксель закрашен в среднем трижды»). Площадь считается по всему квадрату частицы или ленте (шейдер
 * выполняется для каждого пикселя квадрата, даже где он прозрачен), без отсечения экраном и глубиной: оценка сверху.
 * Одна частица (лента) даёт не больше одного слоя: вплотную к камере она всё равно закрывает лишь экран.
 */
export function estimateFill(buffers: ParticleBuffers, count: number, def: SystemDef, view: FillView): number {
    const [cx, cy, cz] = view.position;
    const [fx, fy, fz] = view.forward;
    const { mode, stretch, trail } = def.render;
    const screen = view.width * view.height;
    let area = 0;
    for (let i = 0; i < count; i++) {
        const z = (buffers.pos[i * 3]! - cx) * fx + (buffers.pos[i * 3 + 1]! - cy) * fy + (buffers.pos[i * 3 + 2]! - cz) * fz;
        if (!view.ortho && z < 1e-3) continue; // позади камеры
        const size = buffers.size[i]!;
        if (mode === 'ribbon') {
            let ribbon = 0;
            const c = buffers.trailCount[i]!;
            const base = i * buffers.trailStride;
            for (let j = 0; j < c - 1; j++) {
                const p = (base + j) * 3;
                const len = Math.hypot(buffers.trailPos[p]! - buffers.trailPos[p + 3]!, buffers.trailPos[p + 1]! - buffers.trailPos[p + 4]!, buffers.trailPos[p + 2]! - buffers.trailPos[p + 5]!);
                const u = (buffers.trailU[base + j]! + buffers.trailU[base + j + 1]!) / 2;
                const mz = view.ortho ? z : Math.max(1e-3, z);
                const s = scaleAt(view, mz);
                ribbon += len * s * size * evalCurve(trail.widthOverLength, u) * s;
            }
            area += Math.min(ribbon, screen); // одна лента не закрасит больше экрана (иначе близкая к камере раздувает оценку)
            continue;
        }
        const s = scaleAt(view, z);
        let length = size;
        if (mode === 'stretch') length = size * (1 + stretch * Math.hypot(buffers.vel[i * 3]!, buffers.vel[i * 3 + 1]!, buffers.vel[i * 3 + 2]!));
        area += Math.min(length * s * size * s, screen); // частица не закрасит больше экрана, как бы близко ни была к камере
    }
    return area / screen;
}

export interface BudgetReport {
    /** Сколько секунд системы проанализировано. */
    duration: number;
    /** Сколько моментов времени измерено. */
    samples: number;
    peakLive: number;
    avgLive: number;
    /** Момент, когда живых частиц больше всего. */
    peakLiveTime: number;
    /** Слои перекрытия (см. `estimateFill`). */
    peakFill: number;
    avgFill: number;
    peakFillTime: number;
    /** Время расчёта симуляции на кадр, мс (CPU). */
    simMsAvg: number;
    simMsPeak: number;
    /** Вершин за кадр на пике (билборды: 4 на частицу; лента: 2 на точку шлейфа). */
    peakVertices: number;
    /** Число живых частиц упёрлось в `maxParticles`: лишние частицы вытесняются, эффект может выглядеть обрезанным. */
    capped: boolean;
}

export interface BudgetOptions {
    /** Сколько секунд анализировать; по умолчанию два цикла плюс время жизни (для одноразовой системы цикл плюс время жизни). */
    duration?: number;
    /** Число измерений; по умолчанию 120. */
    samples?: number;
}

/**
 * Прогоняет систему по времени и считает бюджет: частицы, заполнение, стоимость симуляции. Без рендерера и DOM, поэтому
 * годится и для проверки в тестах игры («эффект не превышает N слоёв»), и для панели редактора.
 */
export function measureSystem(def: SystemDef, view: FillView, options: BudgetOptions = {}): BudgetReport {
    const life = rangeMax(def.particle.lifetime);
    const duration = Math.min(120, options.duration ?? (def.loop ? def.duration * 2 + life : def.duration + life));
    const samples = Math.max(2, options.samples ?? 120);
    const sim = createSimulation(def);
    const out = createBuffers(def.maxParticles, trailStrideOf(def));

    let sumLive = 0;
    let sumFill = 0;
    let sumMs = 0;
    const report: BudgetReport = { duration, samples, peakLive: 0, avgLive: 0, peakLiveTime: 0, peakFill: 0, avgFill: 0, peakFillTime: 0, simMsAvg: 0, simMsPeak: 0, peakVertices: 0, capped: false };
    for (let k = 0; k < samples; k++) {
        const t = (k / (samples - 1)) * duration;
        const t0 = performance.now();
        const count = sim.seek(t, out);
        const ms = performance.now() - t0;
        const fill = estimateFill(out, count, def, view);
        sumLive += count;
        sumFill += fill;
        sumMs += ms;
        if (count > report.peakLive) {
            report.peakLive = count;
            report.peakLiveTime = t;
        }
        if (fill > report.peakFill) {
            report.peakFill = fill;
            report.peakFillTime = t;
        }
        report.simMsPeak = Math.max(report.simMsPeak, ms);
    }
    report.avgLive = sumLive / samples;
    report.avgFill = sumFill / samples;
    report.simMsAvg = sumMs / samples;
    report.peakVertices = def.render.mode === 'ribbon' ? report.peakLive * (def.render.trail.segments + 1) * 2 : report.peakLive * 4;
    report.capped = report.peakLive >= def.maxParticles;
    return report;
}
