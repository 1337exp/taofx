import { WIDTH, type Constant, type DataType } from '@/graph/types';

/** Значение входа как массив компонент нужной длины: число растягивается на все компоненты, недостающие — нули. */
export function partsOf(type: DataType, value: Constant | undefined): number[] {
    const width = WIDTH[type];
    const raw = Array.isArray(value) ? value : value === undefined ? [] : [value];
    return Array.from({ length: width }, (_, i) => raw[i] ?? (raw.length === 1 ? raw[0]! : 0));
}

/** Массив компонент → значение для хранения: число для float, иначе массив. */
export function valueOfParts(type: DataType, parts: number[]): Constant {
    return type === 'float' ? (parts[0] ?? 0) : parts.slice(0, WIDTH[type]);
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const hex2 = (n: number) => Math.round(clamp01(n) * 255).toString(16).padStart(2, '0');

/** [r, g, b] в 0…1 → '#rrggbb' (для `<input type="color">`). Значения вне диапазона обрезаются. */
export const toHex = (rgb: number[]): string => `#${hex2(rgb[0] ?? 0)}${hex2(rgb[1] ?? 0)}${hex2(rgb[2] ?? 0)}`;

/** '#rrggbb' → [r, g, b] в 0…1; не цвет → null. */
export function fromHex(hex: string): [number, number, number] | null {
    const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
    return m ? [parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255] : null;
}

/** Текст поля → число; пустое или не число дают 0. */
export function parseNumber(text: string): number {
    const n = Number(text);
    return text.trim() === '' || !Number.isFinite(n) ? 0 : n;
}

/** Цвет пина по типу: тот же тип, тот же цвет, на любой теме. */
export const TYPE_COLORS: Record<DataType | 'gen', string> = {
    float: '#9ccc65',
    vec2: '#4dd0e1',
    vec3: '#ffb74d',
    vec4: '#ba68c8',
    color: '#f06292',
    gen: '#b0bec5',
};
