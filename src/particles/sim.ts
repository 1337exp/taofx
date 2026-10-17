import { evalCurve, evalGradient, rangeMax, sampleRange } from './curve';
import { curl3 } from './noise';
import { hash5, unit } from './random';
import type { Collider, Force, ParticleBuffers, Shape, SystemDef } from './types';

/** Сколько точек шлейфа (голова и сегменты) нужно системе: 0, если она не рисует ленту. */
export const trailStrideOf = (def: SystemDef): number => (def.render.mode === 'ribbon' ? def.render.trail.segments + 1 : 0);

/** Выходные массивы под `max` частиц; `trailStride` точек шлейфа на частицу (см. `trailStrideOf`). */
export function createBuffers(max: number, trailStride = 0): ParticleBuffers {
    return {
        pos: new Float32Array(max * 3),
        vel: new Float32Array(max * 3),
        size: new Float32Array(max),
        rot: new Float32Array(max),
        age: new Float32Array(max),
        rand: new Float32Array(max),
        tint: new Float32Array(max * 3),
        alpha: new Float32Array(max),
        trailStride,
        trailPos: new Float32Array(max * trailStride * 3),
        trailU: new Float32Array(max * trailStride),
        trailCount: new Uint8Array(max),
    };
}

export interface Simulation {
    readonly maxParticles: number;
    /**
     * Состояние системы в момент `time` (секунды от запуска) записывается в `out` (от старых частиц к молодым);
     * возвращает число живых частиц. Результат зависит только от времени и параметров, истории нет: время можно
     * перематывать вперёд и назад, результат тот же (бит в бит). Ход вперёд дешёвый (частицы дошагивают), прыжок
     * назад пересчитывает живых частиц от их рождения (жизнь частицы конечна, поэтому недорого).
     */
    seek(time: number, out: ParticleBuffers): number;
}

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const EPS = 1e-9;

/**
 * Слоты случайных чисел частицы. Каждое свойство берёт своё число: меняя одно, остальные не трогаем.
 */
const SLOT = { life: 0, speed: 1, size: 2, rot: 3, spin: 4, a: 5, b: 6, c: 7, d: 8, dirA: 9, dirB: 10, extra: 11 } as const;

//--------------------------------------------------
// Силы и препятствия в виде, удобном горячему циклу: числа без вложенных объектов и строк.

const FieldKind = { Turbulence: 0, Attractor: 1, Vortex: 2, Wind: 3 } as const;
type FieldKind = (typeof FieldKind)[keyof typeof FieldKind];

interface Field {
    kind: FieldKind;
    /** Положение (притяжение, вихрь) или скорость ветра. */
    x: number;
    y: number;
    z: number;
    /** Ось вихря, единичная. */
    ax: number;
    ay: number;
    az: number;
    strength: number;
    radius: number;
    scale: number;
    speed: number;
    seed: number;
}

interface Wall {
    sphere: boolean;
    /** Нормаль плоскости (единичная) или центр шара. */
    x: number;
    y: number;
    z: number;
    /** Смещение плоскости или радиус шара. */
    d: number;
    bounce: number;
    friction: number;
    kill: boolean;
}

function unitVec(v: readonly [number, number, number], fallback: [number, number, number]): [number, number, number] {
    const len = Math.hypot(v[0], v[1], v[2]);
    return len < EPS ? fallback : [v[0] / len, v[1] / len, v[2] / len];
}

function compileField(f: Force, seed: number, index: number): Field {
    const base: Field = { kind: FieldKind.Wind, x: 0, y: 0, z: 0, ax: 0, ay: 1, az: 0, strength: 0, radius: 0, scale: 1, speed: 0, seed: hash5(seed, index, 0x7f4a, 0, 0) | 0 };
    switch (f.type) {
        case 'turbulence':
            return { ...base, kind: FieldKind.Turbulence, strength: f.strength, scale: f.scale, speed: f.speed };
        case 'attractor':
            return { ...base, kind: FieldKind.Attractor, x: f.position[0], y: f.position[1], z: f.position[2], strength: f.strength, radius: f.radius };
        case 'vortex': {
            const [ax, ay, az] = unitVec(f.axis, [0, 1, 0]);
            return { ...base, kind: FieldKind.Vortex, x: f.position[0], y: f.position[1], z: f.position[2], ax, ay, az, strength: f.strength, radius: f.radius };
        }
        case 'wind':
            return { ...base, kind: FieldKind.Wind, x: f.velocity[0], y: f.velocity[1], z: f.velocity[2], strength: f.strength };
    }
}

function compileWall(c: Collider): Wall {
    if (c.type === 'plane') {
        const [x, y, z] = unitVec(c.normal, [0, 1, 0]);
        return { sphere: false, x, y, z, d: c.offset, bounce: c.bounce, friction: c.friction, kill: c.kill };
    }
    return { sphere: true, x: c.center[0], y: c.center[1], z: c.center[2], d: c.radius, bounce: c.bounce, friction: c.friction, kill: c.kill };
}

//--------------------------------------------------

/** Рождение: цикл, вид (0 равномерный поток, иначе 1 + номер всплеска) и номер частицы в нём. */
type SpawnFn = (cycle: number, kind: number, n: number, birth: number) => void;

export function createSimulation(def: SystemDef): Simulation {
    const { emitter, particle, render } = def;
    const max = def.maxParticles;
    const maxLife = rangeMax(particle.lifetime);
    const dur = Math.max(def.duration, EPS);
    const rate = emitter.rate;
    const continuous = rate > 0 ? Math.max(0, Math.ceil(rate * dur - EPS)) : 0;

    // всплески по времени (при равных по номеру): так события одного цикла идут в одном порядке всегда
    const bursts = emitter.bursts
        .map((b, i) => ({ time: b.time, count: b.count, kind: 1 + i }))
        .filter((b) => b.time >= 0 && b.time < dur && b.count > 0)
        .sort((a, b) => a.time - b.time || a.kind - b.kind);

    /**
     * События рождения со временем в (a, b] по порядку (время, вид, номер): сначала одинаковые по времени идёт поток,
     * потом всплески. Время рождения считается один раз и из него же проверяется попадание в окно, поэтому
     * соседние окна не теряют и не дублируют события.
     */
    function enumerate(a: number, b: number, spawn: SpawnFn): void {
        const first = def.loop ? Math.max(0, Math.floor(a / dur) - 1) : 0;
        const last = def.loop ? Math.floor(b / dur) + 1 : 0;
        for (let cycle = first; cycle <= last; cycle++) {
            const base = cycle * dur;
            let n = continuous > 0 ? Math.max(0, Math.floor((a - base) * rate) - 1) : 0;
            const end = continuous > 0 ? Math.min(continuous - 1, Math.ceil((b - base) * rate) + 1) : -1;
            let bi = 0;
            let k = 0;
            for (;;) {
                while (n <= end && base + n / rate <= a) n++;
                const tc = n <= end ? base + n / rate : Infinity;
                // пропускаем отданные всплески и те, что остались левее окна
                while (bi < bursts.length && (k >= bursts[bi]!.count || base + bursts[bi]!.time <= a)) {
                    bi++;
                    k = 0;
                }
                const tb = bi < bursts.length ? base + bursts[bi]!.time : Infinity;
                if (tc > b && tb > b) break;
                if (tc <= tb) {
                    spawn(cycle, 0, n, tc);
                    n++;
                } else {
                    spawn(cycle, bursts[bi]!.kind, k, tb);
                    k++;
                }
            }
        }
    }

    //----------------------------------------------
    // Состояние частиц: массивы по слотам. Слоты берутся из стека свободных, порядок рождения держит `order`.

    const px = new Float64Array(max);
    const py = new Float64Array(max);
    const pz = new Float64Array(max);
    const vx = new Float64Array(max);
    const vy = new Float64Array(max);
    const vz = new Float64Array(max);
    const ax = new Float64Array(max);
    const ay = new Float64Array(max);
    const az = new Float64Array(max);
    const accValid = new Uint8Array(max);
    const dead = new Uint8Array(max);
    const birthAt = new Float64Array(max);
    const lifeOf = new Float64Array(max);
    const size0 = new Float64Array(max);
    const rot0 = new Float64Array(max);
    const spinOf = new Float64Array(max);
    const randOf = new Float64Array(max);
    const stepsDone = new Int32Array(max);
    const seqOf = new Float64Array(max);

    const free = new Int32Array(max);
    for (let i = 0; i < max; i++) free[i] = max - 1 - i;
    let freeTop = max;
    const order = new Int32Array(max * 2);
    let head = 0;
    let tail = 0;
    let seqNo = 0;

    const release = (slot: number) => void (free[freeTop++] = slot);

    // Шаг и коэффициенты точного решения dv/dt = a − k·v на шаге с постоянным ускорением.
    const dt = Math.max(def.step, 1e-4);
    const invDt = 1 / dt;
    const k = particle.drag;
    const damped = k >= 1e-6;
    const ek = damped ? Math.exp(-k * dt) : 1;
    const gk = (1 - ek) / (damped ? k : 1);
    const [gx, gy, gz] = particle.gravity;

    const fields = particle.forces.map((f, i) => compileField(f, def.seed, i));
    const walls = particle.colliders.map(compileWall);
    const tmp = new Float64Array(3);

    // Шлейф: кольцо отсчётов пути на частицу. Отсчёт берётся каждые `stride` шагов, всего `segments` последних.
    const trailStride = trailStrideOf(def);
    const segments = Math.max(0, trailStride - 1);
    const stride = segments > 0 ? Math.max(1, Math.round(render.trail.length / (segments * dt))) : 1;
    const span = segments * stride * dt;
    const hist = new Float32Array(max * segments * 3);
    const histCount = new Uint8Array(max);
    const histHead = new Uint8Array(max);

    function pushHistory(slot: number): void {
        const o = (slot * segments + histHead[slot]!) * 3;
        hist[o] = px[slot]!;
        hist[o + 1] = py[slot]!;
        hist[o + 2] = pz[slot]!;
        histHead[slot] = (histHead[slot]! + 1) % segments;
        if (histCount[slot]! < segments) histCount[slot]!++;
    }

    //----------------------------------------------
    // Рождение

    const sp = new Float64Array(6); // положение и направление вылета

    /** Начальные положение и направление по форме излучателя: записывает в `sp`. */
    function emit(shape: Shape, u: (slot: number) => number): void {
        switch (shape.type) {
            case 'point': {
                const z = 1 - 2 * u(SLOT.dirA);
                const r = Math.sqrt(Math.max(0, 1 - z * z));
                const phi = TAU * u(SLOT.dirB);
                sp[0] = sp[1] = sp[2] = 0;
                sp[3] = r * Math.cos(phi);
                sp[4] = z;
                sp[5] = r * Math.sin(phi);
                return;
            }
            case 'circle': {
                const rho = shape.radius * (shape.edge ? 1 : Math.sqrt(u(SLOT.a)));
                const phi = TAU * u(SLOT.b);
                sp[0] = rho * Math.cos(phi);
                sp[1] = 0;
                sp[2] = rho * Math.sin(phi);
                sp[3] = 0;
                sp[4] = 1;
                sp[5] = 0;
                return;
            }
            case 'cone': {
                const rho = shape.radius * Math.sqrt(u(SLOT.a));
                const phi = TAU * u(SLOT.b);
                const half = shape.angle * DEG;
                // равномерно по телесному углу конуса
                const cosA = 1 - u(SLOT.dirA) * (1 - Math.cos(half));
                const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
                const psi = TAU * u(SLOT.dirB);
                sp[0] = rho * Math.cos(phi);
                sp[1] = 0;
                sp[2] = rho * Math.sin(phi);
                sp[3] = sinA * Math.cos(psi);
                sp[4] = cosA;
                sp[5] = sinA * Math.sin(psi);
                return;
            }
            case 'box':
                sp[0] = (u(SLOT.a) - 0.5) * shape.size[0];
                sp[1] = (u(SLOT.b) - 0.5) * shape.size[1];
                sp[2] = (u(SLOT.c) - 0.5) * shape.size[2];
                sp[3] = 0;
                sp[4] = 1;
                sp[5] = 0;
                return;
        }
    }

    let rollCycle = 0;
    let rollKind = 0;
    let rollN = 0;
    const roll = (slot: number): number => unit(hash5(def.seed, rollCycle, rollKind, rollN, slot));

    const onSpawn: SpawnFn = (cycle, kind, n, birth) => {
        rollCycle = cycle;
        rollKind = kind;
        rollN = n;
        // кольцо: частица номер n вытесняет частицу n − max, даже если та жива (освобождаем место до выдачи слота)
        while (head < tail && seqOf[order[head]!]! < seqNo + 1 - max) release(order[head++]!);
        const slot = free[--freeTop]!;
        emit(emitter.shape, roll);
        const speed = sampleRange(particle.speed, roll(SLOT.speed));
        px[slot] = sp[0]!;
        py[slot] = sp[1]!;
        pz[slot] = sp[2]!;
        vx[slot] = sp[3]! * speed;
        vy[slot] = sp[4]! * speed;
        vz[slot] = sp[5]! * speed;
        birthAt[slot] = birth;
        lifeOf[slot] = Math.max(1e-6, sampleRange(particle.lifetime, roll(SLOT.life)));
        size0[slot] = sampleRange(particle.size, roll(SLOT.size));
        rot0[slot] = sampleRange(particle.rotation, roll(SLOT.rot));
        spinOf[slot] = sampleRange(particle.spin, roll(SLOT.spin));
        randOf[slot] = roll(SLOT.extra);
        stepsDone[slot] = 0;
        accValid[slot] = 0;
        dead[slot] = 0;
        seqOf[slot] = seqNo++;
        histCount[slot] = 0;
        histHead[slot] = 0;
        if (segments > 0) pushHistory(slot);

        if (tail === order.length) {
            order.copyWithin(0, head, tail);
            tail -= head;
            head = 0;
        }
        order[tail++] = slot;
    };

    //----------------------------------------------
    // Шаги

    /** Ускорение частицы в её текущем состоянии: гравитация и силы. Кладёт в ax/ay/az слота. */
    function accelerate(slot: number): void {
        const x = px[slot]!;
        const y = py[slot]!;
        const z = pz[slot]!;
        let sx = gx;
        let sy = gy;
        let sz = gz;
        if (fields.length > 0) {
            const t = birthAt[slot]! + stepsDone[slot]! * dt;
            for (let i = 0; i < fields.length; i++) {
                const f = fields[i]!;
                switch (f.kind) {
                    case FieldKind.Turbulence: {
                        const s = f.scale;
                        const drift = t * f.speed;
                        curl3(x * s + drift * 0.37, y * s + drift * 0.61, z * s + drift * 0.83, f.seed, tmp);
                        sx += f.strength * tmp[0]!;
                        sy += f.strength * tmp[1]!;
                        sz += f.strength * tmp[2]!;
                        break;
                    }
                    case FieldKind.Attractor: {
                        const dx = f.x - x;
                        const dy = f.y - y;
                        const dz = f.z - z;
                        const d = Math.hypot(dx, dy, dz);
                        if (d > EPS) {
                            const w = (f.radius > 0 ? Math.max(0, 1 - d / f.radius) : 1) * f.strength / d;
                            sx += dx * w;
                            sy += dy * w;
                            sz += dz * w;
                        }
                        break;
                    }
                    case FieldKind.Vortex: {
                        const rx = x - f.x;
                        const ry = y - f.y;
                        const rz = z - f.z;
                        const along = rx * f.ax + ry * f.ay + rz * f.az;
                        const qx = rx - f.ax * along;
                        const qy = ry - f.ay * along;
                        const qz = rz - f.az * along;
                        const len = Math.hypot(qx, qy, qz);
                        if (len > EPS) {
                            // касательная = ось × радиальный вектор; длина касательной равна len, делим на неё
                            const w = (f.radius > 0 ? Math.max(0, 1 - len / f.radius) : 1) * f.strength / len;
                            sx += (f.ay * qz - f.az * qy) * w;
                            sy += (f.az * qx - f.ax * qz) * w;
                            sz += (f.ax * qy - f.ay * qx) * w;
                        }
                        break;
                    }
                    case FieldKind.Wind:
                        sx += (f.x - vx[slot]!) * f.strength;
                        sy += (f.y - vy[slot]!) * f.strength;
                        sz += (f.z - vz[slot]!) * f.strength;
                        break;
                }
            }
        }
        ax[slot] = sx;
        ay[slot] = sy;
        az[slot] = sz;
        accValid[slot] = 1;
    }

    /** Один шаг частицы: точное решение для постоянного на шаге ускорения, затем препятствия. */
    function commit(slot: number): void {
        if (!accValid[slot]) accelerate(slot);
        const a0 = ax[slot]!;
        const a1 = ay[slot]!;
        const a2 = az[slot]!;
        if (damped) {
            const t0 = a0 / k;
            const t1 = a1 / k;
            const t2 = a2 / k;
            px[slot]! += t0 * dt + (vx[slot]! - t0) * gk;
            py[slot]! += t1 * dt + (vy[slot]! - t1) * gk;
            pz[slot]! += t2 * dt + (vz[slot]! - t2) * gk;
            vx[slot] = t0 + (vx[slot]! - t0) * ek;
            vy[slot] = t1 + (vy[slot]! - t1) * ek;
            vz[slot] = t2 + (vz[slot]! - t2) * ek;
        } else {
            px[slot]! += vx[slot]! * dt + 0.5 * a0 * dt * dt;
            py[slot]! += vy[slot]! * dt + 0.5 * a1 * dt * dt;
            pz[slot]! += vz[slot]! * dt + 0.5 * a2 * dt * dt;
            vx[slot]! += a0 * dt;
            vy[slot]! += a1 * dt;
            vz[slot]! += a2 * dt;
        }
        stepsDone[slot]!++;
        accValid[slot] = 0;
        for (let i = 0; i < walls.length; i++) {
            if (collide(slot, walls[i]!)) {
                dead[slot] = 1;
                return;
            }
        }
        if (segments > 0 && stepsDone[slot]! % stride === 0) pushHistory(slot);
    }

    /** Выталкивает частицу из препятствия и отражает скорость. Возвращает true, если частицу надо убить. */
    function collide(slot: number, w: Wall): boolean {
        let nx = w.x;
        let ny = w.y;
        let nz = w.z;
        let depth: number;
        if (w.sphere) {
            const dx = px[slot]! - w.x;
            const dy = py[slot]! - w.y;
            const dz = pz[slot]! - w.z;
            const dist = Math.hypot(dx, dy, dz);
            depth = dist - w.d;
            if (depth >= 0) return false;
            if (dist > EPS) {
                nx = dx / dist;
                ny = dy / dist;
                nz = dz / dist;
            } else {
                nx = 0;
                ny = 1;
                nz = 0;
            }
        } else {
            depth = nx * px[slot]! + ny * py[slot]! + nz * pz[slot]! - w.d;
            if (depth >= 0) return false;
        }
        if (w.kill) return true;
        px[slot]! -= depth * nx;
        py[slot]! -= depth * ny;
        pz[slot]! -= depth * nz;
        const vn = vx[slot]! * nx + vy[slot]! * ny + vz[slot]! * nz;
        if (vn < 0) {
            const keep = 1 - w.friction;
            vx[slot] = (vx[slot]! - vn * nx) * keep - vn * nx * w.bounce;
            vy[slot] = (vy[slot]! - vn * ny) * keep - vn * ny * w.bounce;
            vz[slot] = (vz[slot]! - vn * nz) * keep - vn * nz * w.bounce;
        }
        return false;
    }

    /** Выталкивает точку `pos[o…o+2]` из препятствия (только положение, скорость не трогаем). */
    function keepOutside(pos: Float32Array, o: number, w: Wall): void {
        if (w.sphere) {
            const dx = pos[o]! - w.x;
            const dy = pos[o + 1]! - w.y;
            const dz = pos[o + 2]! - w.z;
            const dist = Math.hypot(dx, dy, dz);
            if (dist >= w.d || dist < EPS) return;
            const k2 = w.d / dist;
            pos[o] = w.x + dx * k2;
            pos[o + 1] = w.y + dy * k2;
            pos[o + 2] = w.z + dz * k2;
            return;
        }
        const depth = w.x * pos[o]! + w.y * pos[o + 1]! + w.z * pos[o + 2]! - w.d;
        if (depth >= 0) return;
        pos[o] = pos[o]! - depth * w.x;
        pos[o + 1] = pos[o + 1]! - depth * w.y;
        pos[o + 2] = pos[o + 2]! - depth * w.z;
    }

    //----------------------------------------------
    // Перемотка

    let started = false;
    let lastTime = 0;
    const grad: [number, number, number, number] = [1, 1, 1, 1];

    function reset(): void {
        for (let i = 0; i < max; i++) free[i] = max - 1 - i;
        freeTop = max;
        head = tail = 0;
        seqNo = 0;
    }

    return {
        maxParticles: max,
        seek(time, out) {
            if (!(time >= 0)) {
                reset();
                started = false;
                return 0;
            }
            // вперёд на небольшой интервал: рожаем новых и дошагиваем живых; иначе пересчёт от рождения
            let from = lastTime;
            if (!started || time < lastTime || time - lastTime > maxLife) {
                reset();
                from = time - maxLife;
            }
            started = true;
            lastTime = time;
            enumerate(from, time, onSpawn);

            const withTrail = trailStride > 0 && out.trailStride === trailStride;
            let count = 0;
            let w = head;
            const first = head;
            for (let i = first; i < tail; i++) {
                const slot = order[i]!;
                const age = time - birthAt[slot]!;
                if (age >= lifeOf[slot]! || dead[slot]) {
                    release(slot);
                    continue;
                }
                const want = Math.floor(age * invDt);
                while (stepsDone[slot]! < want && !dead[slot]) commit(slot);
                if (dead[slot]) {
                    release(slot);
                    continue;
                }
                order[w++] = slot;

                // положение на промежутке после последнего шага: тот же закон движения при постоянном ускорении
                if (!accValid[slot]) accelerate(slot);
                const rem = age - stepsDone[slot]! * dt;
                const o = count * 3;
                if (damped) {
                    const e = Math.exp(-k * rem);
                    const g = (1 - e) / k;
                    const t0 = ax[slot]! / k;
                    const t1 = ay[slot]! / k;
                    const t2 = az[slot]! / k;
                    out.pos[o] = px[slot]! + t0 * rem + (vx[slot]! - t0) * g;
                    out.pos[o + 1] = py[slot]! + t1 * rem + (vy[slot]! - t1) * g;
                    out.pos[o + 2] = pz[slot]! + t2 * rem + (vz[slot]! - t2) * g;
                    out.vel[o] = t0 + (vx[slot]! - t0) * e;
                    out.vel[o + 1] = t1 + (vy[slot]! - t1) * e;
                    out.vel[o + 2] = t2 + (vz[slot]! - t2) * e;
                } else {
                    out.pos[o] = px[slot]! + vx[slot]! * rem + 0.5 * ax[slot]! * rem * rem;
                    out.pos[o + 1] = py[slot]! + vy[slot]! * rem + 0.5 * ay[slot]! * rem * rem;
                    out.pos[o + 2] = pz[slot]! + vz[slot]! * rem + 0.5 * az[slot]! * rem * rem;
                    out.vel[o] = vx[slot]! + ax[slot]! * rem;
                    out.vel[o + 1] = vy[slot]! + ay[slot]! * rem;
                    out.vel[o + 2] = vz[slot]! + az[slot]! * rem;
                }

                // промежуток между шагами тоже не заходит в препятствия (иначе частица на кадр «тонет» в плоскости)
                for (let i = 0; i < walls.length; i++) keepOutside(out.pos, o, walls[i]!);

                const t01 = age / lifeOf[slot]!;
                out.size[count] = size0[slot]! * evalCurve(particle.sizeOverLife, t01);
                out.rot[count] = (rot0[slot]! + spinOf[slot]! * age) * DEG;
                out.age[count] = t01;
                out.rand[count] = randOf[slot]!;
                evalGradient(particle.colorOverLife, t01, grad);
                out.tint[o] = grad[0];
                out.tint[o + 1] = grad[1];
                out.tint[o + 2] = grad[2];
                out.alpha[count] = grad[3];

                if (withTrail) writeTrail(slot, count, age, out);
                count++;
            }
            tail = w;
            return count;
        },
    };

    /** Шлейф частицы: голова в текущем положении, дальше отсчёты пути от новых к старым. */
    function writeTrail(slot: number, i: number, age: number, out: ParticleBuffers): void {
        const base = i * trailStride;
        out.trailPos[base * 3] = out.pos[i * 3]!;
        out.trailPos[base * 3 + 1] = out.pos[i * 3 + 1]!;
        out.trailPos[base * 3 + 2] = out.pos[i * 3 + 2]!;
        out.trailU[base] = 0;
        const n = histCount[slot]!;
        const newest = Math.floor(stepsDone[slot]! / stride) * stride;
        for (let j = 0; j < n; j++) {
            const at = (slot * segments + ((histHead[slot]! - 1 - j + segments * 2) % segments)) * 3;
            const p = (base + 1 + j) * 3;
            out.trailPos[p] = hist[at]!;
            out.trailPos[p + 1] = hist[at + 1]!;
            out.trailPos[p + 2] = hist[at + 2]!;
            out.trailU[base + 1 + j] = Math.min(1, (age - (newest - j * stride) * dt) / span);
        }
        out.trailCount[i] = n + 1;
    }
}
