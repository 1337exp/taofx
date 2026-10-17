import { describe, expect, it } from 'vitest';
import { estimateFill, measureSystem, type FillView } from '@/particles/budget';
import { defaultSystem } from '@/particles/serialize';
import { createBuffers, createSimulation, trailStrideOf } from '@/particles/sim';
import type { SystemDef } from '@/particles/types';

/** Камера в (0, 0, 10) смотрит по −Z; экран 1000x1000, 1000 пикселей на единицу на расстоянии 1. */
const view: FillView = { position: [0, 0, 10], forward: [0, 0, -1], width: 1000, height: 1000, pixelsPerUnit: 1000 };

/** Одна неподвижная частица размера 1 в начале координат (расстояние до камеры 10). */
function still(patch: Partial<SystemDef> = {}): SystemDef {
    const d = defaultSystem();
    return {
        ...d,
        loop: false,
        duration: 1,
        emitter: { rate: 0, bursts: [{ time: 0, count: 1 }], shape: { type: 'point' } },
        particle: { ...d.particle, lifetime: 5, speed: 0, size: 1, gravity: [0, 0, 0] },
        ...patch,
    };
}

function fillOf(def: SystemDef, v: FillView = view, t = 1): number {
    const sim = createSimulation(def);
    const out = createBuffers(def.maxParticles, trailStrideOf(def));
    const n = sim.seek(t, out);
    return estimateFill(out, n, def, v);
}

describe('заполнение', () => {
    it('квадрат размера 1 на расстоянии 10: (1000/10)² пикселей из миллиона', () => {
        expect(fillOf(still())).toBeCloseTo(0.01, 6);
    });

    it('вдвое дальше вчетверо меньше, ортографическая камера не зависит от расстояния', () => {
        expect(fillOf(still(), { ...view, position: [0, 0, 20] })).toBeCloseTo(0.0025, 6);
        expect(fillOf(still(), { ...view, ortho: true, pixelsPerUnit: 100 })).toBeCloseTo(0.01, 6); // 100 px · 100 px = 10000
        expect(fillOf(still(), { ...view, ortho: true, pixelsPerUnit: 100, position: [0, 0, 500] })).toBeCloseTo(0.01, 6);
    });

    it('вплотную к камере частица даёт не больше одного слоя', () => {
        expect(fillOf(still(), { ...view, position: [0, 0, 0.01] })).toBe(1);
    });

    it('позади камеры не считается', () => {
        expect(fillOf(still(), { ...view, position: [0, 0, -5] })).toBe(0);
    });

    it('вытянутый квадрат длиннее на (1 + stretch · скорость)', () => {
        const base = still();
        const moving = { ...base, particle: { ...base.particle, speed: 2 }, render: { ...base.render, mode: 'stretch' as const, stretch: 0.5 } };
        // t = 0: частица в начале, но скорость уже есть
        const fill = fillOf(moving, view, 0);
        expect(fill).toBeCloseTo(0.01 * (1 + 0.5 * 2), 5);
    });

    it('лента: площадь = длина пути · ширина (по кривой)', () => {
        const d = defaultSystem();
        const def: SystemDef = {
            ...still(),
            particle: { ...d.particle, lifetime: 5, speed: 0, size: 0.1, gravity: [3, 0, 0], forces: [], colliders: [] },
            render: { ...d.render, mode: 'ribbon', trail: { length: 1, segments: 8, widthOverLength: 1 } },
        };
        const fill = fillOf(def, view, 1);
        // частица разгоняется вдоль X: путь за секунду 1,5 единицы (0.5·3·1²), лента 0.1 шириной, масштаб 100 px/ед
        expect(fill).toBeGreaterThan(0);
        expect(fill).toBeLessThan((1.5 * 100 * 0.1 * 100) / 1e6 + 1e-9);
    });
});

describe('бюджет по времени', () => {
    const fountain: SystemDef = { ...defaultSystem(), loop: true, duration: 2, maxParticles: 500, emitter: { rate: 100, bursts: [{ time: 0, count: 40 }], shape: { type: 'cone', angle: 15, radius: 0.1 } } };

    it('пик частиц, средние, момент пика и стоимость симуляции', () => {
        const r = measureSystem(fountain, view);
        expect(r.peakLive).toBeGreaterThan(100);
        expect(r.avgLive).toBeLessThan(r.peakLive);
        expect(r.avgLive).toBeGreaterThan(0);
        expect(r.peakFill).toBeGreaterThanOrEqual(r.avgFill);
        expect(r.peakFillTime).toBeGreaterThanOrEqual(0);
        expect(r.peakFillTime).toBeLessThanOrEqual(r.duration);
        expect(r.simMsPeak).toBeGreaterThanOrEqual(r.simMsAvg);
        expect(r.peakVertices).toBe(r.peakLive * 4);
        expect(r.capped).toBe(false);
    });

    it('замечает, что число частиц упёрлось в предел', () => {
        expect(measureSystem({ ...fountain, maxParticles: 20 }, view).capped).toBe(true);
    });

    it('результат не зависит от числа измерений в пределах разумного: пик близок', () => {
        const a = measureSystem(fountain, view, { samples: 60 });
        const b = measureSystem(fountain, view, { samples: 240 });
        expect(Math.abs(a.peakLive - b.peakLive) / b.peakLive).toBeLessThan(0.15);
    });
});
