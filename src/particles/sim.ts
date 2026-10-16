import { evalCurve, evalGradient, rangeMax, sampleRange } from './curve';
import { hashInts, unit } from './random';
import type { ParticleBuffers, Shape, SystemDef } from './types';

/** Выходные массивы под `max` частиц. */
export function createBuffers(max: number): ParticleBuffers {
    return {
        pos: new Float32Array(max * 3),
        size: new Float32Array(max),
        rot: new Float32Array(max),
        age: new Float32Array(max),
        rand: new Float32Array(max),
        tint: new Float32Array(max * 3),
        alpha: new Float32Array(max),
    };
}

export interface Simulation {
    readonly maxParticles: number;
    /**
     * Состояние системы в момент `time` (секунды от запуска) записывается в `out`; возвращает число живых частиц.
     * Состояние зависит только от времени и seed, истории нет: можно прыгать вперёд и назад, результат тот же.
     */
    seek(time: number, out: ParticleBuffers): number;
}

/** Событие рождения: когда и ключ для случайных чисел (цикл, вид, номер). */
interface Spawn {
    time: number;
    cycle: number;
    kind: number;
    n: number;
}

const TAU = Math.PI * 2;
const EPS = 1e-9;

/**
 * Слоты случайных чисел частицы. Каждое свойство берёт своё число: меняя одно, остальные не трогаем.
 */
const SLOT = { life: 0, speed: 1, size: 2, rot: 3, spin: 4, a: 5, b: 6, c: 7, d: 8, dirA: 9, dirB: 10, extra: 11 } as const;

/** Случайное число частицы по её событию рождения и слоту. */
const roll = (seed: number, e: Spawn, slot: number): number => unit(hashInts(seed, e.cycle, e.kind, e.n, slot));

/** Начальные положение и направление по форме излучателя. */
function emit(shape: Shape, u: (slot: number) => number): { p: [number, number, number]; d: [number, number, number] } {
    switch (shape.type) {
        case 'point': {
            const z = 1 - 2 * u(SLOT.dirA);
            const r = Math.sqrt(Math.max(0, 1 - z * z));
            const phi = TAU * u(SLOT.dirB);
            return { p: [0, 0, 0], d: [r * Math.cos(phi), z, r * Math.sin(phi)] };
        }
        case 'circle': {
            const rho = shape.radius * (shape.edge ? 1 : Math.sqrt(u(SLOT.a)));
            const phi = TAU * u(SLOT.b);
            return { p: [rho * Math.cos(phi), 0, rho * Math.sin(phi)], d: [0, 1, 0] };
        }
        case 'cone': {
            const rho = shape.radius * Math.sqrt(u(SLOT.a));
            const phi = TAU * u(SLOT.b);
            const half = (shape.angle * Math.PI) / 180;
            // равномерно по телесному углу конуса
            const cosA = 1 - u(SLOT.dirA) * (1 - Math.cos(half));
            const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
            const psi = TAU * u(SLOT.dirB);
            return { p: [rho * Math.cos(phi), 0, rho * Math.sin(phi)], d: [sinA * Math.cos(psi), cosA, sinA * Math.sin(psi)] };
        }
        case 'box':
            return { p: [(u(SLOT.a) - 0.5) * shape.size[0], (u(SLOT.b) - 0.5) * shape.size[1], (u(SLOT.c) - 0.5) * shape.size[2]], d: [0, 1, 0] };
    }
}

/** Смещение вдоль одной оси за время `a` при ускорении `g`, начальной скорости `v` и сопротивлении `k` (решение в замкнутом виде). */
function travel(v: number, g: number, k: number, a: number): number {
    if (k < 1e-6) return v * a + 0.5 * g * a * a;
    const terminal = g / k;
    return terminal * a + ((v - terminal) * (1 - Math.exp(-k * a))) / k;
}

export function createSimulation(def: SystemDef): Simulation {
    const { emitter, particle } = def;
    const maxLife = rangeMax(particle.lifetime);
    const dur = Math.max(def.duration, 1e-6);
    const continuous = Math.max(0, Math.ceil(emitter.rate * dur - EPS)); // событий равномерного излучения за цикл
    const grad: [number, number, number, number] = [1, 1, 1, 1];

    /** События рождения, которые могли дожить до `time`, по возрастанию времени рождения. */
    function spawnsBefore(time: number): Spawn[] {
        const lo = time - maxLife;
        const first = def.loop ? Math.max(0, Math.floor(lo / dur)) : 0;
        const last = def.loop ? Math.floor(time / dur) : 0;
        const list: Spawn[] = [];

        for (let cycle = first; cycle <= last; cycle++) {
            const base = cycle * dur;
            if (emitter.rate > 0 && continuous > 0) {
                const from = Math.max(0, Math.ceil((lo - base) * emitter.rate - EPS));
                const to = Math.min(continuous - 1, Math.floor((time - base) * emitter.rate + EPS));
                for (let n = from; n <= to; n++) list.push({ time: base + n / emitter.rate, cycle, kind: 0, n });
            }
            emitter.bursts.forEach((burst, bi) => {
                const at = base + burst.time;
                if (burst.time < 0 || burst.time >= dur || at > time || at <= lo - EPS) return;
                for (let n = 0; n < burst.count; n++) list.push({ time: at, cycle, kind: 1 + bi, n });
            });
        }
        return list.sort((a, b) => a.time - b.time || a.kind - b.kind || a.n - b.n);
    }

    return {
        maxParticles: def.maxParticles,
        seek(time, out) {
            const spawns = spawnsBefore(time);
            let count = 0;
            // собираем живых с конца (самые молодые), пока не заполнится предел
            const live: { e: Spawn; age: number; life: number }[] = [];
            for (let i = spawns.length - 1; i >= 0 && live.length < def.maxParticles; i--) {
                const e = spawns[i]!;
                const life = Math.max(1e-6, sampleRange(particle.lifetime, roll(def.seed, e, SLOT.life)));
                const age = time - e.time;
                if (age >= 0 && age < life) live.push({ e, age, life });
            }

            for (let k = live.length - 1; k >= 0; k--) {
                const { e, age, life } = live[k]!;
                const u = (slot: number) => roll(def.seed, e, slot);
                const { p, d } = emit(emitter.shape, u);
                const speed = sampleRange(particle.speed, u(SLOT.speed));
                const t01 = age / life;

                const i = count++;
                const g = particle.gravity;
                out.pos[i * 3] = p[0] + travel(d[0] * speed, g[0], particle.drag, age);
                out.pos[i * 3 + 1] = p[1] + travel(d[1] * speed, g[1], particle.drag, age);
                out.pos[i * 3 + 2] = p[2] + travel(d[2] * speed, g[2], particle.drag, age);
                out.size[i] = sampleRange(particle.size, u(SLOT.size)) * evalCurve(particle.sizeOverLife, t01);
                out.rot[i] = ((sampleRange(particle.rotation, u(SLOT.rot)) + sampleRange(particle.spin, u(SLOT.spin)) * age) * Math.PI) / 180;
                out.age[i] = t01;
                out.rand[i] = u(SLOT.extra);
                evalGradient(particle.colorOverLife, t01, grad);
                out.tint[i * 3] = grad[0];
                out.tint[i * 3 + 1] = grad[1];
                out.tint[i * 3 + 2] = grad[2];
                out.alpha[i] = grad[3];
            }
            return count;
        },
    };
}
