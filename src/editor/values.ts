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
