// Тело документа «флипбук» и то, что с ним делают без картинки в руках: прочитать со значениями по умолчанию, выбрать кадр
// по времени. Ядро без DOM; сам документ (формат, версия, id) и его проверка живут в `project/kinds.ts`.

import { guessBackground } from './background';
import type { RGB } from './color';
import { autoFrames, type BackgroundKey, DEFAULT_KEY_HIGH, DEFAULT_KEY_LOW, gridFrames } from './flipbook';
import type { ImageLike, Rect } from './types';

/** Как найдены кадры: равной сеткой или по цвету фона. Сами кадры хранятся рядом, это только настройки, чтобы пересчитать. */
export type Detect =
    | { mode: 'grid'; cols: number; rows: number }
    | { mode: 'auto'; color: RGB; tolerance: number; gap: number; minSize: number };

export interface FlipbookBody {
    /** Id картинки-ассета; пусто, пока не выбрана. */
    image: string;
    frames: Rect[];
    fps: number;
    detect: Detect;
    /** Фон, который при запекании становится прозрачным; null: пиксели как есть. */
    key: BackgroundKey | null;
    /** Id картинки проекта с запечённым листом (её выбирают материалы); пусто, пока не запечён. Производное: в историю правок не входит. */
    sheet: string;
}

export const DEFAULT_FPS = 12;
export const DEFAULT_DETECT: Detect = { mode: 'grid', cols: 1, rows: 1 };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
export const isRgb = (v: unknown): v is RGB => Array.isArray(v) && v.length === 3 && v.every((c) => Number.isInteger(c) && c >= 0 && c <= 255);

/** Настройки поиска кадров в теле: годные принимаются, остальное заменяется значением по умолчанию. */
export function readDetect(value: unknown): Detect {
    if (isObj(value) && value.mode === 'grid' && Number.isInteger(value.cols) && Number.isInteger(value.rows) && (value.cols as number) >= 1 && (value.rows as number) >= 1) {
        return { mode: 'grid', cols: value.cols as number, rows: value.rows as number };
    }
    if (isObj(value) && value.mode === 'auto' && isRgb(value.color) && isNum(value.tolerance) && isNum(value.gap) && isNum(value.minSize)) {
        return { mode: 'auto', color: value.color, tolerance: value.tolerance, gap: value.gap, minSize: value.minSize };
    }
    return { ...DEFAULT_DETECT };
}

export function readKey(value: unknown): BackgroundKey | null {
    if (isObj(value) && isRgb(value.color) && isNum(value.low) && isNum(value.high)) return { color: value.color, low: value.low, high: value.high };
    return null;
}

/** Тело документа из того, что лежит в файле (тело уже прошло `check`: форма кадров и fps верна), с настройками по умолчанию. */
export function readBody(raw: Record<string, unknown>): FlipbookBody {
    return {
        image: typeof raw.image === 'string' ? raw.image : '',
        frames: Array.isArray(raw.frames) ? (raw.frames as Rect[]).map(({ x, y, w, h }) => ({ x, y, w, h })) : [],
        fps: isNum(raw.fps) && raw.fps > 0 ? raw.fps : DEFAULT_FPS,
        detect: readDetect(raw.detect),
        key: readKey(raw.key),
        sheet: typeof raw.sheet === 'string' ? raw.sheet : '',
    };
}

/** Ключ фона по умолчанию для цвета: мягкий переход, как в примере со взрывом. */
export const defaultKey = (color: RGB): BackgroundKey => ({ color, low: DEFAULT_KEY_LOW, high: DEFAULT_KEY_HIGH });

/** Номер кадра в момент `time` секунд: кадры сменяются с частотой `fps`, анимация идёт по кругу. Пустой список: -1. */
export function frameIndexAt(count: number, fps: number, time: number): number {
    if (!(count > 0)) return -1;
    if (!(fps > 0) || !Number.isFinite(time) || time < 0) return 0;
    return Math.floor(time * fps) % count;
}

/** Кадры картинки по настройкам поиска. */
export function framesFor(detect: Detect, image: ImageLike): Rect[] {
    if (detect.mode === 'grid') return gridFrames(image.width, image.height, detect.cols, detect.rows);
    return autoFrames(image, { color: detect.color, tolerance: detect.tolerance, gap: detect.gap, minSize: detect.minSize });
}

/** Цвет фона листа: тот, что занимает его границу, а не нашёлся (JPEG с шумом), цвет левого верхнего пикселя. */
export function backgroundOf(image: ImageLike): RGB {
    const guessed = guessBackground(image);
    if (guessed) return guessed;
    if (image.width === 0 || image.height === 0) return [0, 0, 0];
    return [image.data[0]!, image.data[1]!, image.data[2]!];
}

/** Настройки поиска по фону с цветом `color`: допуск и размеры, с которыми находятся кадры взрыва из примера (шесть кадров; искры рядом с взрывом склеиваются зазором 8). */
export const autoDetect = (color: RGB): Detect => ({ mode: 'auto', color, tolerance: 4, gap: 8, minSize: 8 });
