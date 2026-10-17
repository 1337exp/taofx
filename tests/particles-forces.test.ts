import { describe, expect, it } from 'vitest';
import { curl3, noise3 } from '@/particles/noise';
import { defaultSystem } from '@/particles/serialize';
import { createBuffers, createSimulation, trailStrideOf } from '@/particles/sim';
import type { Collider, Force, SystemDef } from '@/particles/types';

/** Система с одной частицей в нуле без скорости: удобная «пробирка» для сил. */
function probe(patch: { forces?: Force[]; colliders?: Collider[]; gravity?: [number, number, number]; drag?: number; speed?: number; shape?: SystemDef['emitter']['shape']; lifetime?: number; step?: number } = {}): SystemDef {
    const d = defaultSystem();
    return {
        ...d,
        duration: 10,
        loop: false,
        seed: 5,
        step: patch.step ?? 1 / 120,
        emitter: { rate: 0, bursts: [{ time: 0, count: 1 }], shape: patch.shape ?? { type: 'point' } },
        particle: { ...d.particle, lifetime: patch.lifetime ?? 20, speed: patch.speed ?? 0, size: 1, gravity: patch.gravity ?? [0, 0, 0], drag: patch.drag ?? 0, forces: patch.forces ?? [], colliders: patch.colliders ?? [] },
    };
}

function at(def: SystemDef, t: number) {
    const sim = createSimulation(def);
    const out = createBuffers(def.maxParticles, trailStrideOf(def));
    const count = sim.seek(t, out);
    return { count, out };
}

describe('шум', () => {
    it('градиент совпадает с конечными разностями', () => {
        const h = 1e-5;
        for (const [x, y, z] of [[0.3, 1.7, -2.2], [5.55, -0.1, 3.9], [-4.4, 2.2, 0.01]] as const) {
            const g = Array.from(noise3(x, y, z, 1, 3).slice(1));
            const num = [
                (noise3(x + h, y, z, 1, 3)[0]! - noise3(x - h, y, z, 1, 3)[0]!) / (2 * h),
                (noise3(x, y + h, z, 1, 3)[0]! - noise3(x, y - h, z, 1, 3)[0]!) / (2 * h),
                (noise3(x, y, z + h, 1, 3)[0]! - noise3(x, y, z - h, 1, 3)[0]!) / (2 * h),
            ];
            g.forEach((v, i) => expect(v).toBeCloseTo(num[i]!, 4));
        }
    });

    it('значения в пределах −1…1 и повторяются для одних аргументов', () => {
        let lo = 1;
        let hi = -1;
        for (let i = 0; i < 3000; i++) {
            const v = noise3(i * 0.137, i * 0.051 - 4, i * 0.093, 2, 9)[0]!;
            lo = Math.min(lo, v);
            hi = Math.max(hi, v);
        }
        expect(lo).toBeGreaterThanOrEqual(-1);
        expect(hi).toBeLessThanOrEqual(1);
        expect(hi - lo).toBeGreaterThan(1); // шум не вырожден
        expect(noise3(1.5, 2.5, 3.5, 1, 4)[0]).toBe(noise3(1.5, 2.5, 3.5, 1, 4)[0]);
        expect(noise3(1.5, 2.5, 3.5, 1, 4)[0]).not.toBe(noise3(1.5, 2.5, 3.5, 1, 5)[0]);
    });

    it('ротор без дивергенции', () => {
        const h = 1e-4;
        const f = (x: number, y: number, z: number) => {
            const r = new Float64Array(3);
            curl3(x, y, z, 7, r);
            return r;
        };
        for (const [x, y, z] of [[0.4, 0.9, 1.3], [-2.1, 3.3, 0.2], [7.7, -5.5, 2.4]] as const) {
            const div = (f(x + h, y, z)[0]! - f(x - h, y, z)[0]!) / (2 * h) + (f(x, y + h, z)[1]! - f(x, y - h, z)[1]!) / (2 * h) + (f(x, y, z + h)[2]! - f(x, y, z - h)[2]!) / (2 * h);
            expect(Math.abs(div)).toBeLessThan(1e-3);
        }
    });
});

describe('движение: точность шагов', () => {
    it('гравитация и сопротивление совпадают с точным решением (в том числе на дробном шаге)', () => {
        const g = [0.5, -9.8, 0.2];
        const k = 0.7;
        const v = 3;
        const def = probe({ gravity: [g[0]!, g[1]!, g[2]!], drag: k, speed: v, shape: { type: 'point' } });
        // направление вылета: та же частица без гравитации и сопротивления летит по прямой
        const straight = at(probe({ speed: v, shape: { type: 'point' } }), 1).out;
        const dir = [straight.pos[0]! / v, straight.pos[1]! / v, straight.pos[2]! / v];
        for (const t of [0.5, 1.234, 2.9]) {
            const { out } = at(def, t);
            for (let i = 0; i < 3; i++) {
                const vt = g[i]! / k;
                const exact = vt * t + (dir[i]! * v - vt) * (1 - Math.exp(-k * t)) / k;
                expect(out.pos[i]!).toBeCloseTo(exact, 6);
            }
        }
    });
});

describe('силы', () => {
    it('притяжение тянет к точке, отталкивание от неё', () => {
        const pull = at(probe({ forces: [{ type: 'attractor', position: [5, 0, 0], strength: 4, radius: 0 }] }), 1).out;
        expect(pull.pos[0]!).toBeGreaterThan(1.5);
        expect(Math.abs(pull.pos[1]!)).toBeLessThan(1e-9);
        const push = at(probe({ forces: [{ type: 'attractor', position: [5, 0, 0], strength: -4, radius: 0 }] }), 1).out;
        expect(push.pos[0]!).toBeLessThan(-1.5);
    });

    it('радиус ослабляет силу до нуля', () => {
        const near = at(probe({ forces: [{ type: 'attractor', position: [1, 0, 0], strength: 4, radius: 0.5 }] }), 1).out;
        expect(near.pos[0]!).toBe(0); // притяжение не достаёт: расстояние 1 больше радиуса 0,5
    });

    it('вихрь крутит вокруг оси: частица набирает скорость вдоль касательной', () => {
        const def = probe({ speed: 0, shape: { type: 'circle', radius: 1, edge: true }, forces: [{ type: 'vortex', position: [0, 0, 0], axis: [0, 1, 0], strength: 3, radius: 0 }] });
        const { out } = at(def, 1);
        // момент импульса относительно оси Y: z·vx − x·vz. Касательная ось × радиус = (z, 0, −x), так что он положителен
        const angular = out.pos[2]! * out.vel[0]! - out.pos[0]! * out.vel[2]!;
        expect(angular).toBeGreaterThan(1);
        expect(Math.abs(out.pos[1]!)).toBeLessThan(1e-9); // вдоль оси силы нет
    });

    it('ветер подтягивает скорость к скорости ветра', () => {
        const { out } = at(probe({ forces: [{ type: 'wind', velocity: [2, 0, 0], strength: 3 }] }), 3);
        expect(out.vel[0]!).toBeCloseTo(2, 3);
    });

    it('турбулентность сдвигает частицы и одинакова при повторе; другое поле при другом seed', () => {
        const f: Force = { type: 'turbulence', strength: 4, scale: 1, speed: 0.3 };
        const a = at(probe({ forces: [f] }), 2).out;
        const b = at(probe({ forces: [f] }), 2).out;
        expect(Math.hypot(a.pos[0]!, a.pos[1]!, a.pos[2]!)).toBeGreaterThan(0.01);
        expect(Array.from(a.pos.slice(0, 3))).toEqual(Array.from(b.pos.slice(0, 3)));
        const other = at({ ...probe({ forces: [f] }), seed: 6 }, 2).out;
        expect(Array.from(other.pos.slice(0, 3))).not.toEqual(Array.from(a.pos.slice(0, 3)));
    });
});

describe('препятствия', () => {
    const floor = (patch: Partial<Extract<Collider, { type: 'plane' }>> = {}): Collider => ({ type: 'plane', normal: [0, 1, 0], offset: 0, bounce: 0.5, friction: 0, kill: false, ...patch });
    /** Частица вылетает строго вверх со скоростью `v` и падает на препятствия. */
    const thrown = (colliders: Collider[], v = 4): SystemDef => {
        const d = probe({ gravity: [0, -9.8, 0], colliders, speed: v });
        return { ...d, emitter: { ...d.emitter, shape: { type: 'cone', angle: 0, radius: 0 } } };
    };
    const heights = (def: SystemDef, until: number) => {
        const sim = createSimulation(def);
        const out = createBuffers(def.maxParticles);
        const ys: { t: number; y: number }[] = [];
        for (let t = 0; t <= until; t += 0.01) {
            if (sim.seek(t, out) > 0) ys.push({ t, y: out.pos[1]! });
        }
        return ys;
    };

    it('плоскость не пропускает частицу и отражает скорость с потерей', () => {
        const ys = heights(thrown([floor({ bounce: 0.5 })]), 3);
        expect(Math.min(...ys.map((p) => p.y))).toBeGreaterThanOrEqual(-1e-6);
        const first = Math.max(...ys.filter((p) => p.t < 0.8).map((p) => p.y));
        const second = Math.max(...ys.filter((p) => p.t > 1).map((p) => p.y));
        expect(first).toBeCloseTo(0.816, 1); // v²/2g
        expect(second).toBeGreaterThan(0.1);
        expect(second).toBeLessThan(first * 0.5); // отскок слабее: (0,5)² от высоты
    });

    it('без отскока и с трением частица ложится на плоскость', () => {
        const ys = heights(thrown([floor({ bounce: 0, friction: 1 })]), 5);
        expect(ys[ys.length - 1]!.y).toBeCloseTo(0, 2);
    });

    it('kill убирает частицу при касании', () => {
        expect(at(thrown([floor({ kill: true })]), 0.5).count).toBe(1); // ещё летит вверх
        expect(at(thrown([floor({ kill: true })]), 2).count).toBe(0); // упала на плоскость
    });

    it('шар выталкивает частицу наружу', () => {
        const def = probe({ speed: 0, colliders: [{ type: 'sphere', center: [0, 0, 0], radius: 1, bounce: 0.5, friction: 0, kill: false }] });
        const { out } = at(def, 0.1); // родилась в центре шара: первый шаг выбрасывает на поверхность
        expect(Math.hypot(out.pos[0]!, out.pos[1]!, out.pos[2]!)).toBeGreaterThanOrEqual(1 - 1e-6);
    });
});

describe('кольцо maxParticles', () => {
    it('частица вытесняется, когда родилось max более новых, даже если она жива', () => {
        const def: SystemDef = { ...defaultSystem(), duration: 10, loop: false, maxParticles: 4, emitter: { rate: 10, bursts: [], shape: { type: 'point' } }, particle: { ...defaultSystem().particle, lifetime: 100, speed: 0, gravity: [0, 0, 0] } };
        // за 1,05 с родилось 11 частиц (в 0, 0.1, … 1.0): живы последние 4
        const { count, out } = at(def, 1.05);
        expect(count).toBe(4);
        expect(out.age[0]!).toBeGreaterThan(out.age[3]!);
        expect(out.age[0]! * 100).toBeCloseTo(0.35, 4); // самая старая из живых родилась в 0.7
    });
});

describe('перемотка бит в бит', () => {
    const rich: SystemDef = {
        ...defaultSystem(),
        duration: 1.7,
        loop: true,
        seed: 99,
        maxParticles: 60,
        step: 1 / 90,
        emitter: { rate: 25, bursts: [{ time: 0.2, count: 9 }, { time: 1.1, count: 6 }], shape: { type: 'cone', angle: 30, radius: 0.2 } },
        particle: {
            ...defaultSystem().particle,
            lifetime: [0.4, 1.8],
            speed: [1, 4],
            gravity: [0, -4, 0],
            drag: 0.4,
            spin: [-90, 90],
            forces: [
                { type: 'turbulence', strength: 3, scale: 1.3, speed: 0.4 },
                { type: 'vortex', position: [0, 1, 0], axis: [0, 1, 0], strength: 2, radius: 3 },
                { type: 'wind', velocity: [1, 0, 0], strength: 0.5 },
                { type: 'attractor', position: [0, 3, 0], strength: 1, radius: 5 },
            ],
            colliders: [{ type: 'plane', normal: [0, 1, 0], offset: -1, bounce: 0.5, friction: 0.2, kill: false }, { type: 'sphere', center: [0.5, 0.5, 0], radius: 0.4, bounce: 0.3, friction: 0, kill: false }],
        },
        render: { ...defaultSystem().render, mode: 'ribbon', trail: { length: 0.4, segments: 8, widthOverLength: 1 } },
    };

    const snapshot = (sim: ReturnType<typeof createSimulation>, t: number) => {
        const out = createBuffers(rich.maxParticles, trailStrideOf(rich));
        const n = sim.seek(t, out);
        return { n, pos: Array.from(out.pos.slice(0, n * 3)), vel: Array.from(out.vel.slice(0, n * 3)), age: Array.from(out.age.slice(0, n)), trail: Array.from(out.trailPos.slice(0, n * out.trailStride * 3)), trailU: Array.from(out.trailU.slice(0, n * out.trailStride)), counts: Array.from(out.trailCount.slice(0, n)) };
    };

    it('любая последовательность перемоток даёт то же состояние, что свежий расчёт', () => {
        const sim = createSimulation(rich);
        const times = [0, 0.016, 0.033, 0.5, 0.51, 3.3, 3.31, 1.2, 7.77, 7.78, 7.8, 0.4, 5.05, 5.06, 12, 12.001, 12.002, 2.5, 2.9, 30];
        for (const t of times) {
            const walked = snapshot(sim, t);
            const fresh = snapshot(createSimulation(rich), t);
            expect(walked).toEqual(fresh);
        }
    });

    it('мелкий шаг вперёд (как кадры игры) совпадает с прыжком сразу', () => {
        const stepping = createSimulation(rich);
        let last = snapshot(stepping, 0);
        for (let t = 1 / 60; t <= 6; t += 1 / 60) last = snapshot(stepping, t);
        const tEnd = 360 * (1 / 60);
        void last;
        const a = snapshot(stepping, tEnd);
        const b = snapshot(createSimulation(rich), tEnd);
        expect(a).toEqual(b);
    });

    it('шлейф: голова в положении частицы, отсчёты уходят назад по пути, u растёт к хвосту', () => {
        const sim = createSimulation(rich);
        const out = createBuffers(rich.maxParticles, trailStrideOf(rich));
        const n = sim.seek(3.1, out);
        expect(n).toBeGreaterThan(5);
        const stride = out.trailStride;
        expect(stride).toBe(9);
        for (let i = 0; i < n; i++) {
            expect(out.trailPos[i * stride * 3]!).toBe(out.pos[i * 3]!);
            expect(out.trailU[i * stride]!).toBe(0);
            const c = out.trailCount[i]!;
            expect(c).toBeGreaterThanOrEqual(1);
            expect(c).toBeLessThanOrEqual(stride);
            for (let j = 2; j < c; j++) expect(out.trailU[i * stride + j]!).toBeGreaterThan(out.trailU[i * stride + j - 1]!);
        }
    });
});
