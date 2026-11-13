// Флипбук: кадры анимации на картинке и лист с равными ячейками для рантайма.
// Ядро без DOM: пиксели приходят и уходят как `ImageLike` (RGBA), поэтому работает в воркере и в тестах на Node.
// Поиск спрайтов и PNG порт ядра sprite-cutter (рядом лежащие файлы); здесь то, что нужно именно флипбуку.

import type { RGB } from './color';
import { detectSprites } from './detect';
import { assertImage, clipRect } from './image';
import type { ImageLike, Rect } from './types';

/** Самая «квадратная» сетка, в которую помещается `count` ячеек: столбцы и строки. */
export function balancedGrid(count: number): [cols: number, rows: number] {
    if (!(count > 0)) return [0, 0];
    const cols = Math.ceil(Math.sqrt(count));
    return [cols, Math.ceil(count / cols)];
}

/**
 * Кадры равной сеткой, слева направо и сверху вниз. Остаток от деления (картинка не кратна сетке) остаётся неиспользованным
 * справа и снизу: кадры всегда одного размера. Сетка, в которую кадр не помещается (меньше пикселя), даёт пустой список.
 */
export function gridFrames(width: number, height: number, cols: number, rows: number): Rect[] {
    if (![width, height, cols, rows].every(Number.isInteger) || cols < 1 || rows < 1) return [];
    const w = Math.floor(width / cols);
    const h = Math.floor(height / rows);
    if (w < 1 || h < 1) return [];
    const frames: Rect[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) frames.push({ x: c * w, y: r * h, w, h });
    return frames;
}

export interface AutoFramesOptions {
    /** Цвет фона: всё, что к нему ближе допуска, не кадр. Прозрачные пиксели фон всегда. */
    color: RGB;
    /** Допуск цвета фона в процентах от расстояния чёрный-белый, 0…100 (как в `KeyColor`). */
    tolerance: number;
    /** Сколько пустых пикселей может лежать между частями одного кадра (искорки рядом со взрывом). По умолчанию 0. */
    gap?: number;
    /** Кадр уже этого по ширине и высоте не кадр, а мусор. По умолчанию 1. */
    minSize?: number;
}

/** Кадры, найденные по фону: связные группы видимых пикселей, в порядке чтения листа (строка за строкой, слева направо). */
export function autoFrames(image: ImageLike, options: AutoFramesOptions): Rect[] {
    const { sprites } = detectSprites(image, {
        keys: [{ color: options.color, tolerance: options.tolerance }],
        gap: options.gap ?? 0,
        minWidth: options.minSize ?? 1,
        minHeight: options.minSize ?? 1,
        order: 'rows',
    });
    return sprites.map(({ x, y, w, h }) => ({ x, y, w, h }));
}

/** Фон, который при запекании становится прозрачным: расстояние цвета до фона (в единицах 0…255 по RGB) от `low` (прозрачно) до `high` (непрозрачно). */
export interface BackgroundKey {
    color: RGB;
    low: number;
    high: number;
}

export const DEFAULT_KEY_LOW = 6;
export const DEFAULT_KEY_HIGH = 34;

export interface BakeOptions {
    /** Фон в альфу; без него пиксели копируются как есть. */
    key?: BackgroundKey;
    /** Поле вокруг кадра в ячейке, пикселей: нужно, чтобы линейная фильтрация не цепляла соседний кадр. По умолчанию 2. */
    padding?: number;
    /** Столбцов в листе; по умолчанию самая квадратная сетка. */
    cols?: number;
}

export interface BakedSheet extends ImageLike {
    cols: number;
    rows: number;
    /** Сторона квадратной ячейки, пикселей. */
    cell: number;
}

const smoothstep = (a: number, b: number, x: number) => {
    if (b <= a) return x >= b ? 1 : 0;
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};

/**
 * Лист с равными квадратными ячейками (то, что читает нода «Спрайт-лист»): каждый кадр стоит в своей ячейке по центру, не
 * масштабируется, вокруг него `padding` пустых пикселей. С `key` фон кадра становится прозрачным, а цвет очищается от примеси
 * фона (пиксель = a·цвет + (1−a)·фон), иначе по краю остался бы ореол. Кадр за пределами картинки обрезается по ней.
 */
export function bakeSheet(image: ImageLike, frames: readonly Rect[], options: BakeOptions = {}): BakedSheet {
    assertImage(image);
    const padding = Math.max(0, Math.floor(options.padding ?? 2));
    const clipped = frames.map((f) => clipRect(image, f));
    const cell = clipped.reduce((m, f) => Math.max(m, f.w, f.h), 0) + 2 * padding;
    if (clipped.length === 0 || cell <= 2 * padding) return { width: 0, height: 0, data: new Uint8ClampedArray(0), cols: 0, rows: 0, cell: 0 };

    const cols = options.cols !== undefined && options.cols >= 1 ? Math.min(Math.floor(options.cols), clipped.length) : balancedGrid(clipped.length)[0];
    const rows = Math.ceil(clipped.length / cols);
    const width = cols * cell;
    const height = rows * cell;
    const data = new Uint8ClampedArray(width * height * 4);
    const key = options.key;
    const bg = key?.color ?? [0, 0, 0];

    clipped.forEach((f, i) => {
        // кадр по центру ячейки: целые пиксели, лишний пиксель (нечётная разница) уходит вправо и вниз
        const ox = (i % cols) * cell + Math.floor((cell - f.w) / 2);
        const oy = Math.floor(i / cols) * cell + Math.floor((cell - f.h) / 2);
        for (let y = 0; y < f.h; y++) {
            for (let x = 0; x < f.w; x++) {
                const from = ((f.y + y) * image.width + f.x + x) * 4;
                const to = ((oy + y) * width + ox + x) * 4;
                const r = image.data[from]!;
                const g = image.data[from + 1]!;
                const b = image.data[from + 2]!;
                const alpha = image.data[from + 3]!;
                if (!key) {
                    data[to] = r;
                    data[to + 1] = g;
                    data[to + 2] = b;
                    data[to + 3] = alpha;
                    continue;
                }
                const a = smoothstep(key.low, key.high, Math.hypot(r - bg[0], g - bg[1], b - bg[2]));
                if (a > 0) {
                    data[to] = bg[0] + (r - bg[0]) / a;
                    data[to + 1] = bg[1] + (g - bg[1]) / a;
                    data[to + 2] = bg[2] + (b - bg[2]) / a;
                }
                data[to + 3] = Math.round(a * alpha);
            }
        }
    });
    return { width, height, data, cols, rows, cell };
}
