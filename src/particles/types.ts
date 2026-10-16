// Модель системы частиц: чистые данные (JSON). Симуляция по ним детерминирована: состояние в любой момент
// считается из времени и seed, без истории, поэтому время можно перематывать.

import type { Graph } from '../graph/types';

export type Vec3 = [number, number, number];

/** Число или диапазон [мин, макс]: значение для каждой частицы берётся случайно внутри диапазона. */
export type Range = number | [number, number];

/** Точка кривой: t в 0…1 (доля жизни частицы), v значение. Между точками линейно. */
export interface CurvePoint {
    t: number;
    v: number;
}

/** Число (постоянное) или кривая по доле жизни. */
export type Curve = number | CurvePoint[];

/** Остановка градиента цвета по доле жизни: цвет линейный 0…1 и непрозрачность. */
export interface GradientStop {
    t: number;
    color: Vec3;
    alpha: number;
}

/** Откуда вылетают частицы и куда летят. Ось «вверх» это +Y. */
export type Shape =
    /** Из одной точки во все стороны. */
    | { type: 'point' }
    /** Из круга в плоскости XZ (`edge`: только с края), вверх. */
    | { type: 'circle'; radius: number; edge?: boolean }
    /** Из круга радиуса `radius` в конус вокруг +Y с половинным углом `angle` (градусы). */
    | { type: 'cone'; angle: number; radius: number }
    /** Из случайной точки коробки, вверх. */
    | { type: 'box'; size: Vec3 };

/** Всплеск: `count` частиц разом в момент `time` (секунды от начала цикла). */
export interface Burst {
    time: number;
    count: number;
}

export interface EmitterDef {
    /** Частиц в секунду, равномерно. */
    rate: number;
    bursts: Burst[];
    shape: Shape;
}

export interface ParticleDef {
    /** Время жизни, секунды. */
    lifetime: Range;
    /** Начальная скорость вдоль направления вылета, единиц в секунду. */
    speed: Range;
    /** Размер квадрата частицы в мировых единицах. */
    size: Range;
    /** Начальный поворот, градусы. */
    rotation: Range;
    /** Вращение, градусы в секунду. */
    spin: Range;
    /** Ускорение, единиц в секунду за секунду. */
    gravity: Vec3;
    /** Линейное сопротивление: скорость затухает как exp(−drag·t). */
    drag: number;
    /** Множитель размера по доле жизни. */
    sizeOverLife: Curve;
    /** Цвет и непрозрачность по доле жизни (читает нода «Частица» в графе материала). */
    colorOverLife: GradientStop[];
}

export interface SystemDef {
    /** Длительность цикла, секунды: за это время работает излучатель (rate и bursts). */
    duration: number;
    /** Цикл повторяется; иначе излучение заканчивается через `duration`, а летящие частицы доживают. */
    loop: boolean;
    seed: number;
    /** Предел живых частиц: при превышении остаются самые молодые. */
    maxParticles: number;
    blend: 'normal' | 'add';
    emitter: EmitterDef;
    particle: ParticleDef;
}

/** Файл частиц: параметры системы и граф материала, который задаёт вид каждой частицы. */
export interface ParticleFile {
    system: SystemDef;
    material: Graph;
}

/** Выходные данные симуляции: по одному значению (или тройке) на живую частицу. */
export interface ParticleBuffers {
    /** Положение центра, мировые единицы. */
    pos: Float32Array;
    size: Float32Array;
    /** Поворот в плоскости квадрата, радианы. */
    rot: Float32Array;
    /** Доля жизни 0…1. */
    age: Float32Array;
    /** Случайное число 0…1, своё у каждой частицы (для вариаций в графе). */
    rand: Float32Array;
    /** Линейный цвет из градиента. */
    tint: Float32Array;
    alpha: Float32Array;
}
