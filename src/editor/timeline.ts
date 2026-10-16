import { rangeMax } from '@/particles/curve';
import type { SystemDef } from '@/particles/types';

/**
 * Длина полоски таймлайна, секунды: повторяющаяся система показывается на несколько циклов (чтобы видеть установившийся
 * поток), одноразовая на цикл плюс время жизни частиц, чтобы дожили последние.
 */
export function timelineLength(system: SystemDef): number {
    const raw = system.loop ? system.duration * 4 : system.duration + rangeMax(system.particle.lifetime);
    return Math.min(60, Math.max(2, Math.ceil(raw * 10) / 10));
}

/** Моменты, которые стоит пометить на полоске: всплески в каждом цикле и границы циклов. */
export function timelineMarks(system: SystemDef, length: number): { time: number; kind: 'burst' | 'cycle' }[] {
    const marks: { time: number; kind: 'burst' | 'cycle' }[] = [];
    const cycles = system.loop ? Math.ceil(length / system.duration) : 1;
    for (let c = 0; c < cycles; c++) {
        const base = c * system.duration;
        if (c > 0) marks.push({ time: base, kind: 'cycle' });
        for (const b of system.emitter.bursts) if (b.time < system.duration && base + b.time <= length) marks.push({ time: base + b.time, kind: 'burst' });
    }
    return marks;
}

/** Продвигает время воспроизведения на `dt` с возвратом в начало по достижении конца. */
export function advance(time: number, dt: number, length: number): number {
    const next = time + dt;
    return next >= length ? next % length : next;
}
