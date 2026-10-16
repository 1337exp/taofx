import { bad, Invalid, isNum, isObj, isStr, readGraph, type LoadError } from '../graph/serialize';
import type { Registry } from '../graph/registry';
import type { CurvePoint, GradientStop, ParticleFile, Range, Shape, SystemDef, Vec3 } from './types';

/** Имя формата в файле частиц. */
export const PARTICLES_FORMAT = 'taofx-particles';
export const PARTICLES_VERSION = 1;

export type ParticleParseResult = { ok: true; file: ParticleFile; droppedConnections: number } | { ok: false; error: LoadError };

/** Значения по умолчанию: фонтан вверх. Неуказанные поля файла берутся отсюда. */
export function defaultSystem(): SystemDef {
    return {
        duration: 2,
        loop: true,
        seed: 1,
        maxParticles: 1000,
        blend: 'normal',
        emitter: { rate: 40, bursts: [], shape: { type: 'cone', angle: 15, radius: 0.1 } },
        particle: {
            lifetime: [1, 1.6],
            speed: [2, 3],
            size: [0.15, 0.3],
            rotation: 0,
            spin: 0,
            gravity: [0, -3, 0],
            drag: 0,
            sizeOverLife: 1,
            colorOverLife: [{ t: 0, color: [1, 1, 1], alpha: 1 }],
        },
    };
}

export function serializeParticles(file: ParticleFile, pretty = true): string {
    return JSON.stringify({ format: PARTICLES_FORMAT, version: PARTICLES_VERSION, system: file.system, material: file.material }, null, pretty ? 2 : undefined);
}

//--------------------------------------------------

const MAX_PARTICLES = 100_000;
const MAX_RATE = 10_000;

function num(path: string, raw: unknown, fallback: number, min = -Infinity, max = Infinity): number {
    if (raw === undefined) return fallback;
    if (!isNum(raw) || raw < min || raw > max) return bad(path);
    return raw;
}

function range(path: string, raw: unknown, fallback: Range, min = -Infinity): Range {
    if (raw === undefined) return fallback;
    if (isNum(raw) && raw >= min) return raw;
    if (Array.isArray(raw) && raw.length === 2 && raw.every(isNum) && raw[0]! >= min && raw[1]! >= min) return [raw[0]!, raw[1]!];
    return bad(path);
}

function vec3(path: string, raw: unknown, fallback: Vec3): Vec3 {
    if (raw === undefined) return fallback;
    if (Array.isArray(raw) && raw.length === 3 && raw.every(isNum)) return [raw[0]!, raw[1]!, raw[2]!];
    return bad(path);
}

function curve(path: string, raw: unknown, fallback: number | CurvePoint[]): number | CurvePoint[] {
    if (raw === undefined) return fallback;
    if (isNum(raw)) return raw;
    if (!Array.isArray(raw) || raw.length === 0) return bad(path);
    const points = raw.map((p, i): CurvePoint => {
        if (!isObj(p) || !isNum(p.t) || !isNum(p.v) || p.t < 0 || p.t > 1) return bad(`${path}[${i}]`);
        return { t: p.t, v: p.v };
    });
    return points.sort((a, b) => a.t - b.t);
}

function gradient(path: string, raw: unknown, fallback: GradientStop[]): GradientStop[] {
    if (raw === undefined) return fallback;
    if (!Array.isArray(raw) || raw.length === 0) return bad(path);
    const stops = raw.map((s, i): GradientStop => {
        if (!isObj(s) || !isNum(s.t) || s.t < 0 || s.t > 1) return bad(`${path}[${i}]`);
        return { t: s.t, color: vec3(`${path}[${i}].color`, s.color, [1, 1, 1]), alpha: num(`${path}[${i}].alpha`, s.alpha, 1, 0, 1) };
    });
    return stops.sort((a, b) => a.t - b.t);
}

function shape(path: string, raw: unknown, fallback: Shape): Shape {
    if (raw === undefined) return fallback;
    if (!isObj(raw) || !isStr(raw.type)) return bad(path);
    switch (raw.type) {
        case 'point':
            return { type: 'point' };
        case 'circle':
            return { type: 'circle', radius: num(`${path}.radius`, raw.radius, 1, 0), edge: raw.edge === true };
        case 'cone':
            return { type: 'cone', angle: num(`${path}.angle`, raw.angle, 25, 0, 180), radius: num(`${path}.radius`, raw.radius, 0, 0) };
        case 'box':
            return { type: 'box', size: vec3(`${path}.size`, raw.size, [1, 1, 1]) };
        default:
            return bad(`${path}.type`);
    }
}

function parseSystem(raw: unknown): SystemDef {
    const d = defaultSystem();
    if (raw === undefined) return d;
    if (!isObj(raw)) return bad('system');
    const em = raw.emitter === undefined ? {} : raw.emitter;
    const pa = raw.particle === undefined ? {} : raw.particle;
    if (!isObj(em)) return bad('system.emitter');
    if (!isObj(pa)) return bad('system.particle');
    if (raw.blend !== undefined && raw.blend !== 'normal' && raw.blend !== 'add') return bad('system.blend');

    const bursts = em.bursts === undefined ? d.emitter.bursts : em.bursts;
    if (!Array.isArray(bursts)) return bad('system.emitter.bursts');

    return {
        duration: num('system.duration', raw.duration, d.duration, 0.01),
        loop: raw.loop === undefined ? d.loop : raw.loop === true,
        seed: Math.trunc(num('system.seed', raw.seed, d.seed)),
        maxParticles: Math.trunc(num('system.maxParticles', raw.maxParticles, d.maxParticles, 1, MAX_PARTICLES)),
        blend: raw.blend === 'add' ? 'add' : 'normal',
        emitter: {
            rate: num('system.emitter.rate', em.rate, d.emitter.rate, 0, MAX_RATE),
            bursts: bursts.map((b, i) => {
                if (!isObj(b)) return bad(`system.emitter.bursts[${i}]`);
                return { time: num(`system.emitter.bursts[${i}].time`, b.time, 0, 0), count: Math.trunc(num(`system.emitter.bursts[${i}].count`, b.count, 1, 0, MAX_PARTICLES)) };
            }),
            shape: shape('system.emitter.shape', em.shape, d.emitter.shape),
        },
        particle: {
            lifetime: range('system.particle.lifetime', pa.lifetime, d.particle.lifetime, 0.001),
            speed: range('system.particle.speed', pa.speed, d.particle.speed),
            size: range('system.particle.size', pa.size, d.particle.size, 0),
            rotation: range('system.particle.rotation', pa.rotation, d.particle.rotation),
            spin: range('system.particle.spin', pa.spin, d.particle.spin),
            gravity: vec3('system.particle.gravity', pa.gravity, d.particle.gravity),
            drag: num('system.particle.drag', pa.drag, d.particle.drag, 0),
            sizeOverLife: curve('system.particle.sizeOverLife', pa.sizeOverLife, d.particle.sizeOverLife),
            colorOverLife: gradient('system.particle.colorOverLife', pa.colorOverLife, d.particle.colorOverLife),
        },
    };
}

/**
 * Разбирает и проверяет файл частиц. Структура и допустимые диапазоны проверяются строго (ошибка отклоняет файл);
 * пропущенные поля системы берутся из `defaultSystem()`. Граф материала читается теми же правилами, что и обычный эффект.
 */
export function parseParticles(text: string, registry: Registry): ParticleParseResult {
    try {
        let file: unknown;
        try {
            file = JSON.parse(text);
        } catch {
            throw new Invalid({ code: 'invalidJson' });
        }
        if (!isObj(file) || file.format !== PARTICLES_FORMAT) throw new Invalid({ code: 'notTaofxFile' });
        if (!isNum(file.version) || !Number.isInteger(file.version) || file.version < 1) return bad('version');
        if (file.version > PARTICLES_VERSION) throw new Invalid({ code: 'newerVersion', detail: String(file.version) });

        const system = parseSystem(file.system);
        const { graph, dropped } = readGraph(file.material, registry);
        return { ok: true, file: { system, material: graph }, droppedConnections: dropped };
    } catch (e) {
        if (e instanceof Invalid) return { ok: false, error: e.error };
        throw e;
    }
}
