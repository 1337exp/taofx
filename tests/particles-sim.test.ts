import { describe, expect, it } from 'vitest';
import { evalCurve, evalGradient, sampleRange } from '@/particles/curve';
import { hashInts, rand01 } from '@/particles/random';
import { createBuffers, createSimulation } from '@/particles/sim';
import type { SystemDef } from '@/particles/types';

const base: SystemDef = {
    duration: 2,
    loop: false,
    seed: 7,
    maxParticles: 1000,
    blend: 'normal',
    emitter: { rate: 10, bursts: [], shape: { type: 'point' } },
    particle: {
        lifetime: 1,
        speed: 2,
        size: 0.5,
        rotation: 0,
        spin: 0,
        gravity: [0, 0, 0],
        drag: 0,
        sizeOverLife: 1,
        colorOverLife: [{ t: 0, color: [1, 1, 1], alpha: 1 }],
    },
};

type Patch = Partial<Omit<SystemDef, 'particle' | 'emitter'>> & { particle?: Partial<SystemDef['particle']>; emitter?: Partial<SystemDef['emitter']> };

const def = (patch: Patch = {}): SystemDef => ({
    ...base,
    ...patch,
    emitter: { ...base.emitter, ...patch.emitter },
    particle: { ...base.particle, ...patch.particle },
});

function run(d: SystemDef, t: number) {
    const sim = createSimulation(d);
    const out = createBuffers(d.maxParticles);
    const count = sim.seek(t, out);
    return { count, out };
}

describe('random', () => {
    it('хэш детерминирован, зависит от каждого аргумента и укладывается в 32 бита', () => {
        expect(hashInts(1, 2, 3)).toBe(hashInts(1, 2, 3));
        expect(hashInts(1, 2, 3)).not.toBe(hashInts(1, 2, 4));
        expect(hashInts(1, 2, 3)).not.toBe(hashInts(3, 2, 1));
        const r = rand01(5, 6);
        expect(r).toBeGreaterThanOrEqual(0);
        expect(r).toBeLessThan(1);
    });

    it('значения равномерны: среднее около 0,5', () => {
        let sum = 0;
        for (let i = 0; i < 4000; i++) sum += rand01(1, i);
        expect(sum / 4000).toBeGreaterThan(0.47);
        expect(sum / 4000).toBeLessThan(0.53);
    });
});

describe('кривые и градиенты', () => {
    it('диапазон и кривая', () => {
        expect(sampleRange(3, 0.9)).toBe(3);
        expect(sampleRange([2, 4], 0.5)).toBe(3);
        expect(evalCurve(2, 0.3)).toBe(2);
        const c = [{ t: 0, v: 0 }, { t: 0.5, v: 1 }, { t: 1, v: 0 }];
        expect(evalCurve(c, 0.25)).toBeCloseTo(0.5);
        expect(evalCurve(c, 0.75)).toBeCloseTo(0.5);
        expect(evalCurve(c, -1)).toBe(0);
        expect(evalCurve(c, 2)).toBe(0);
    });

    it('переход точки действует на участок до следующей', () => {
        const c = [{ t: 0, v: 0, ease: 'quad-in' as const }, { t: 0.5, v: 1, ease: 'step' as const }, { t: 1, v: 0 }];
        expect(evalCurve(c, 0.25)).toBeCloseTo(0.25); // quad-in на середине участка
        expect(evalCurve(c, 0.75)).toBe(1); // step держит значение до конца участка
        expect(evalCurve(c, 1)).toBe(0);
        expect(evalCurve([{ t: 0, v: 0, ease: { bezier: [0.42, 0, 0.58, 1] } }, { t: 1, v: 1 }], 0.5)).toBeCloseTo(0.5, 3);
    });

    it('градиент интерполирует цвет и альфу, вне краёв держит крайние', () => {
        const g = [{ t: 0.2, color: [1, 0, 0] as [number, number, number], alpha: 1 }, { t: 0.8, color: [0, 0, 1] as [number, number, number], alpha: 0 }];
        expect(evalGradient(g, 0)).toEqual([1, 0, 0, 1]);
        const mid = evalGradient(g, 0.5);
        expect(mid[0]).toBeCloseTo(0.5);
        expect(mid[2]).toBeCloseTo(0.5);
        expect(mid[3]).toBeCloseTo(0.5);
        expect(evalGradient(g, 1)).toEqual([0, 0, 1, 0]);
    });
});

describe('симуляция: излучение', () => {
    it('равномерный поток: число живых растёт с rate и ограничено временем жизни', () => {
        expect(run(def(), 0).count).toBe(1); // первая частица рождается в момент 0
        expect(run(def(), 0.55).count).toBe(6);
        expect(run(def(), 1.05).count).toBeGreaterThan(9); // жизнь 1 с: старые уже умерли
        expect(run(def(), 1.05).count).toBeLessThanOrEqual(11);
    });

    it('без loop излучение кончается через duration, и частицы доживают', () => {
        const d = def();
        expect(run(d, 2.5).count).toBeGreaterThan(0); // последние родились около 1.9
        expect(run(d, 3.5).count).toBe(0);
    });

    it('с loop цикл повторяется', () => {
        const d = def({ loop: true });
        expect(run(d, 10.5).count).toBeGreaterThan(8);
    });

    it('всплеск рождает count частиц разом в своё время', () => {
        const d = def({ emitter: { rate: 0, bursts: [{ time: 0.5, count: 25 }] } });
        expect(run(d, 0.4).count).toBe(0);
        expect(run(d, 0.5).count).toBe(25);
        expect(run(d, 1.2).count).toBe(25);
        expect(run(d, 1.6).count).toBe(0);
    });

    it('предел maxParticles оставляет самых молодых', () => {
        const d = def({ maxParticles: 3, particle: { lifetime: 5 } });
        const { count, out } = run(d, 1.0);
        expect(count).toBe(3);
        expect(out.age[0]!).toBeGreaterThan(out.age[2]!); // порядок от старых к молодым
    });
});

describe('симуляция: детерминизм и перемотка', () => {
    it('один и тот же момент даёт те же данные, в том числе после прыжка по времени', () => {
        const d = def({ loop: true, particle: { lifetime: [0.5, 1.5], speed: [1, 3], size: [0.1, 0.4], spin: [-90, 90], gravity: [0, -9, 0], drag: 0.3 } });
        const sim = createSimulation(d);
        const a = createBuffers(d.maxParticles);
        const b = createBuffers(d.maxParticles);
        const ca = sim.seek(3.3, a);
        sim.seek(9.9, b); // уходим вперёд
        sim.seek(0.2, b); // и назад
        const cb = sim.seek(3.3, b);
        expect(cb).toBe(ca);
        expect(Array.from(b.pos.slice(0, ca * 3))).toEqual(Array.from(a.pos.slice(0, ca * 3)));
        expect(Array.from(b.rot.slice(0, ca))).toEqual(Array.from(a.rot.slice(0, ca)));
    });

    it('другой seed даёт другие частицы', () => {
        const a = run(def({ seed: 1 }), 0.8);
        const b = run(def({ seed: 2 }), 0.8);
        expect(Array.from(b.out.pos.slice(0, 6))).not.toEqual(Array.from(a.out.pos.slice(0, 6)));
    });
});

describe('симуляция: движение', () => {
    it('замкнутая формула совпадает с численным интегрированием (гравитация и сопротивление)', () => {
        const d = def({
            emitter: { rate: 0, bursts: [{ time: 0, count: 1 }], shape: { type: 'point' } },
            particle: { lifetime: 10, speed: 3, gravity: [0.5, -9.8, 0.2], drag: 0.7 },
        });
        const sim = createSimulation(d);
        const out = createBuffers(1);

        // начальная скорость: положение при очень малом возрасте
        sim.seek(1e-4, out);
        const dir = [out.pos[0]! / 1e-4, out.pos[1]! / 1e-4, out.pos[2]! / 1e-4];
        const v = [...dir];
        const p = [0, 0, 0];
        const g = [0.5, -9.8, 0.2];
        const dt = 1e-4;
        for (let t = 0; t < 2; t += dt) {
            for (let k = 0; k < 3; k++) {
                v[k] = v[k]! + (g[k]! - 0.7 * v[k]!) * dt;
                p[k] = p[k]! + v[k]! * dt;
            }
        }
        sim.seek(2, out);
        for (let k = 0; k < 3; k++) expect(out.pos[k]!).toBeCloseTo(p[k]!, 1);
    });

    it('конус держит направление в пределах угла, круг в пределах радиуса', () => {
        const cone = run(def({ emitter: { rate: 0, bursts: [{ time: 0, count: 300 }], shape: { type: 'cone', angle: 20, radius: 0 } }, particle: { lifetime: 5, speed: 1 } }), 1);
        const cos = Math.cos((20 * Math.PI) / 180) - 1e-4;
        for (let i = 0; i < cone.count; i++) {
            const len = Math.hypot(cone.out.pos[i * 3]!, cone.out.pos[i * 3 + 1]!, cone.out.pos[i * 3 + 2]!);
            expect(cone.out.pos[i * 3 + 1]! / len).toBeGreaterThanOrEqual(cos);
        }

        const circle = run(def({ emitter: { rate: 0, bursts: [{ time: 0, count: 300 }], shape: { type: 'circle', radius: 2 } }, particle: { lifetime: 5, speed: 0 } }), 1);
        for (let i = 0; i < circle.count; i++) expect(Math.hypot(circle.out.pos[i * 3]!, circle.out.pos[i * 3 + 2]!)).toBeLessThanOrEqual(2 + 1e-5);
    });

    it('размер, цвет и доля жизни идут по кривым', () => {
        const d = def({
            emitter: { rate: 0, bursts: [{ time: 0, count: 1 }] },
            particle: {
                lifetime: 2,
                size: 1,
                sizeOverLife: [{ t: 0, v: 0 }, { t: 1, v: 2 }],
                colorOverLife: [{ t: 0, color: [1, 0, 0], alpha: 1 }, { t: 1, color: [0, 0, 1], alpha: 0 }],
            },
        });
        const { count, out } = run(d, 1);
        expect(count).toBe(1);
        expect(out.age[0]).toBeCloseTo(0.5);
        expect(out.size[0]).toBeCloseTo(1);
        expect(out.tint[0]).toBeCloseTo(0.5);
        expect(out.alpha[0]).toBeCloseTo(0.5);
    });
});
