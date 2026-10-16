// Граф эффекта: чистые данные (JSON) и определения нод. Ядро не знает ни про Vue, ни про рендерер.

/** Конкретные типы значений. `color` — это vec3 с цветовой семантикой (в редакторе у него будет пипетка). */
export type DataType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'color';

/** `gen` — «как у соседей»: тип пина выводится из подключённых связей (самый широкий), как genType в GLSL. */
export type PinType = DataType | 'gen';

export const WIDTH: Record<DataType, number> = { float: 1, vec2: 2, vec3: 3, vec4: 4, color: 3 };

/** Значение неподключённого входа: число или компоненты вектора/цвета. */
export type Constant = number | number[];

export interface InputPin {
    type: PinType;
    default?: Constant;
    label?: string;
    /**
     * Что подставить, пока вход не подключён, вместо константы: `uv` это координаты текстуры самой поверхности
     * (меша, квадрата частицы, спрайта). У такого входа в редакторе нет поля значения.
     */
    fallback?: 'uv';
}

export interface OutputPin {
    type: PinType;
    label?: string;
}

/** Нода, в которую сходится граф: её входы становятся результатом эффекта. */
export const OUTPUT_NODE = 'output/surface';

/**
 * Что нода требует от цели вывода: нормаль поверхности (материал на 3D-меше) или исходную картинку
 * (фильтр PIXI). Компилятор не соберёт граф для цели, которая этого не даёт, и скажет, какая нода мешает.
 */
export type Capability = 'normal' | 'source' | 'particle';

/** Настройка ноды, которую не выразить пином: сейчас это только выбор текстуры из `Graph.textures`. */
export interface ParamDef {
    type: 'texture';
    label?: string;
}

/** Что получает GLSL-эмиттер ноды вместе с выражениями входов. */
export interface GlslContext {
    /** Параметры ноды (`NodeInstance.params`). */
    readonly params: Readonly<Record<string, string>>;
    /**
     * Выражение vec4 (линейный RGB, прямая альфа) выборки из текстуры `name` по `uv` (vec2, начало внизу слева, как у three).
     * Регистрирует sampler: рантайм привязывает к нему картинку. Нет такой текстуры в графе: ошибка сборки ноды.
     */
    texture(name: string, uv: string): string;
    /** Типы входов после вывода `gen`: нужны, когда формула зависит от размерности. */
    readonly types: Readonly<Record<string, DataType>>;
    /** Подключить функцию GLSL (повторный вызов с тем же именем игнорируется). */
    helper(name: string, code: string): void;
}

/** Строит выражения GLSL выходов из выражений входов (входы уже приведены к своим типам). */
export type GlslEmit = (inputs: Record<string, string>, ctx: GlslContext) => Record<string, string>;

/**
 * Определение ноды: чистые данные, без привязки к рендереру. Как нода превращается в код, решает бэкенд:
 * GLSL-эмиттер лежит здесь (`glsl`), TSL-реализация в `tsl/builders.ts`.
 */
export interface NodeDef {
    id: string;
    title: string;
    inputs: Record<string, InputPin>;
    outputs: Record<string, OutputPin>;
    /** Чего ноде нужно от цели вывода. */
    needs?: readonly Capability[];
    /** Настройки ноды вне пинов (выбор текстуры). */
    params?: Record<string, ParamDef>;
    /** Реализация для GLSL (three с WebGLRenderer, PIXI на WebGL). */
    glsl?: GlslEmit;
}

//--------------------------------------------------
// Граф

export interface NodeInstance {
    id: string;
    /** id определения в реестре. */
    type: string;
    x: number;
    y: number;
    /** Значения неподключённых входов, заданные пользователем. */
    values: Record<string, Constant>;
    /** Настройки вне пинов (см. `NodeDef.params`): имя текстуры из `Graph.textures`. */
    params?: Record<string, string>;
}

export interface PinRef {
    node: string;
    pin: string;
}

export interface Connection {
    id: string;
    from: PinRef; // выход
    to: PinRef; // вход
}

/** Картинка графа: адрес (URL или data:-URI, чтобы файл был самодостаточным). Игра может подменить её своей. */
export interface GraphTexture {
    src: string;
}

export interface Graph {
    nodes: Record<string, NodeInstance>;
    connections: Connection[];
    /** Картинки, на которые ссылаются ноды по имени. Нет поля: текстур в графе нет. */
    textures?: Record<string, GraphTexture>;
}

/** Предел размера одной картинки в файле (символов data:-URI): файл не раздувается и не вешает редактор. */
export const MAX_TEXTURE_SRC = 4_000_000;

/** Положение камеры редактора в файле: чтобы граф открывался там, где его оставили. */
export interface SavedView {
    x: number;
    y: number;
    z: number;
}
