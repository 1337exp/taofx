import { buildRibbon3D, createSorter, depthKeys, gather, ribbonBuffers, type MeshBuffers, type ViewPoint } from './geometry';
import { createBuffers, createSimulation, trailStrideOf, type Simulation } from './sim';
import type { ParticleBuffers, RenderMode, SystemDef } from './types';

/** Что готово к отправке на GPU после `prepare`. */
export interface Prepared {
    /** Сколько инстансов рисовать (билборды и вытянутые квадраты). */
    instances: number;
    /** Сколько индексов рисовать (лента). */
    indices: number;
}

export interface Driver3D {
    readonly mode: RenderMode;
    /** Выход симуляции в порядке рождения (для измерений и инструментов). */
    readonly buffers: ParticleBuffers;
    /** Массивы инстансных атрибутов: одни и те же на всё время жизни (с сортировкой это копия `buffers`). */
    readonly instances: ParticleBuffers;
    /** Меш ленты; `null`, если режим не `ribbon`. */
    readonly ribbon: MeshBuffers | null;
    /** Живых частиц на последнем `seek`. */
    readonly live: number;
    /** Пересчитывает систему на момент `time`. */
    seek(time: number): number;
    /**
     * Готовит данные к отправке на GPU: сортировка от дальних к ближним по камере `view` (null: порядок рождения) и сборка ленты.
     * Лента от камеры не зависит (лицом к камере её разворачивает шейдер), так что подготовку можно делать сразу после `seek`.
     */
    prepare(view: ViewPoint | null): Prepared;
}

/**
 * Всё, что three.js-рантаймам (TSL и GLSL) нужно кроме шейдеров: симуляция, сортировка по глубине и сборка ленты.
 * Не знает о рендерере: видит только числа, поэтому лежит в ядре и одинаково работает в обоих.
 */
export function createDriver3D(system: SystemDef): Driver3D {
    const max = system.maxParticles;
    const mode = system.render.mode;
    const sim: Simulation = createSimulation(system);
    const buffers = createBuffers(max, trailStrideOf(system));
    // сортировка нужна обычному смешиванию; при сложении порядок не важен
    const sorter = system.render.sort && system.blend === 'normal' ? createSorter(max) : null;
    const instances = sorter && mode !== 'ribbon' ? createBuffers(max) : buffers;
    const ribbon = mode === 'ribbon' ? ribbonBuffers(max, system.render.trail.segments, 3) : null;
    let identity: Uint32Array | null = null;
    let live = 0;

    return {
        mode,
        buffers,
        instances,
        ribbon,
        get live() {
            return live;
        },
        seek(time) {
            return (live = sim.seek(time, buffers));
        },
        prepare(view) {
            let order: Uint32Array | null = null;
            if (sorter && view) {
                depthKeys(buffers, live, view, sorter.keys);
                order = sorter.sort(live);
            }
            if (ribbon) {
                const r = buildRibbon3D(buffers, live, order, system.render.trail, ribbon);
                return { instances: 0, indices: r.indices };
            }
            if (instances !== buffers) {
                // без камеры порядок рождения
                if (!order) {
                    if (!identity) identity = Uint32Array.from({ length: max }, (_, i) => i);
                    order = identity;
                }
                gather(buffers, instances, order, live);
            }
            return { instances: live, indices: 0 };
        },
    };
}
