// Модель системы частиц: чистые данные (JSON). Симуляция по ним детерминирована: состояние в любой момент
// считается из времени и seed, поэтому время можно перематывать (вперёд и назад, с тем же результатом).

import type { Graph } from '../graph/types';

export type Vec3 = [number, number, number];

/** Число или диапазон [мин, макс]: значение для каждой частицы берётся случайно внутри диапазона. */
export type Range = number | [number, number];

/**
 * Переход между точками кривой: имя (`linear`, `step`, `cubic-out`…) или Безье `[x1, y1, x2, y2]`. Зеркало типа `Ease`
 * из taoux: пакет не зависит от taoux при установке, а совпадение типов охраняет тест `particles-format`.
 */
export type CurveEase = 'linear' | 'step' | `${'sine' | 'quad' | 'cubic' | 'quart' | 'expo' | 'back' | 'elastic' | 'bounce'}-${'in' | 'out' | 'in-out'}` | { bezier: readonly [number, number, number, number] };

/** Точка кривой: t в 0…1 (доля жизни частицы), v значение. Между точками линейно, если не задан `ease`. */
export interface CurvePoint {
    t: number;
    v: number;
    /** Как идти от этой точки к следующей; без поля линейно. */
    ease?: CurveEase;
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

//--------------------------------------------------
// Силы и препятствия. Они зависят от положения частицы, поэтому симуляция идёт шагами по времени (но у каждой
// частицы своя и независимая от соседей: перемотка остаётся точной).

export type Force =
    /** Завихрения (curl-шум): ускорение вдоль бездивергентного поля, частицы вьются, не слипаясь. */
    | { type: 'turbulence'; /** Ускорение, единиц/с². */ strength: number; /** Пространственная частота: 1 это один «узор» на единицу длины. */ scale: number; /** Скорость изменения поля во времени. */ speed: number }
    /** Притяжение к точке (`strength` > 0) или отталкивание (< 0); `radius` > 0 ослабляет силу до нуля на этом расстоянии, 0 постоянна. */
    | { type: 'attractor'; position: Vec3; strength: number; radius: number }
    /** Вращение вокруг оси, проходящей через `position`; `radius` как у притяжения. */
    | { type: 'vortex'; position: Vec3; axis: Vec3; strength: number; radius: number }
    /** Ветер: скорость частицы подтягивается к `velocity` с коэффициентом `strength` (1/с). */
    | { type: 'wind'; velocity: Vec3; strength: number };

export type Collider =
    /** Плоскость: частицы остаются со стороны нормали (`dot(normal, p) >= offset`). */
    | { type: 'plane'; normal: Vec3; offset: number; bounce: number; friction: number; kill: boolean }
    /** Шар-препятствие: частицы остаются снаружи. */
    | { type: 'sphere'; center: Vec3; radius: number; bounce: number; friction: number; kill: boolean };

//--------------------------------------------------
// Вывод

/**
 * Как рисуется частица:
 *   billboard  квадрат лицом к камере;
 *   stretch    квадрат вытянут вдоль скорости (искры, дождь, трассеры);
 *   ribbon     лента-шлейф за частицей по её недавнему пути.
 */
export type RenderMode = 'billboard' | 'stretch' | 'ribbon';

export interface TrailDef {
    /** Длина шлейфа во времени, секунды. */
    length: number;
    /** Сколько отрезков в ленте (точек на одну больше). */
    segments: number;
    /** Множитель ширины по длине ленты: 0 у головы, 1 у хвоста. */
    widthOverLength: Curve;
}

export interface RenderDef {
    mode: RenderMode;
    /** `stretch`: длина квадрата = размер · (1 + stretch · скорость). */
    stretch: number;
    /** Сортировать частицы от дальних к ближним (нужно обычному смешиванию; для сложения порядок не важен). */
    sort: boolean;
    /** `ribbon`: параметры шлейфа. */
    trail: TrailDef;
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
    /** Силы, зависящие от положения (шум, притяжение, вихрь, ветер). */
    forces: Force[];
    /** Препятствия (плоскость, шар). */
    colliders: Collider[];
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
    /**
     * Предел частиц: кольцо из последних рождённых. Когда рождается частица номер `n`, частица `n − maxParticles`
     * исчезает, даже если ещё жива. Правило зависит только от времени, поэтому одинаково при любой перемотке.
     */
    maxParticles: number;
    /** Шаг симуляции, секунды: у каждой частицы своя сетка шагов от её рождения. Меньше шаг, точнее силы и столкновения, дороже расчёт. */
    step: number;
    blend: 'normal' | 'add';
    emitter: EmitterDef;
    particle: ParticleDef;
    render: RenderDef;
}

/** Файл частиц: параметры системы и граф материала, который задаёт вид каждой частицы. */
export interface ParticleFile {
    system: SystemDef;
    material: Graph;
}

/** Выходные данные симуляции: по одному значению (или тройке) на живую частицу, от старых к молодым. */
export interface ParticleBuffers {
    /** Положение центра, мировые единицы. */
    pos: Float32Array;
    /** Скорость, единиц в секунду. */
    vel: Float32Array;
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
    /** Точек шлейфа на частицу (голова и сегменты), 0: шлейфа нет. */
    trailStride: number;
    /** Точки шлейфа: на частицу `trailStride` троек, от головы к хвосту. */
    trailPos: Float32Array;
    /** Положение точки вдоль шлейфа: 0 у головы, 1 у конца. */
    trailU: Float32Array;
    /** Сколько точек шлейфа заполнено у частицы (голова входит). */
    trailCount: Uint8Array;
}
