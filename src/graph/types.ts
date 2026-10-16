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
}

export interface OutputPin {
    type: PinType;
    label?: string;
}

/**
 * Значение в скомпилированном графе. Для рендерера это узел TSL, но ядру он непрозрачен:
 * его создают и потребляют только `build` нод и компилятор.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Value = any;

export interface NodeDef {
    id: string;
    title: string;
    inputs: Record<string, InputPin>;
    outputs: Record<string, OutputPin>;
    /** Строит значения выходов из значений входов (уже приведённых к нужным типам). */
    build(inputs: Record<string, Value>): Record<string, Value>;
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

export interface Graph {
    nodes: Record<string, NodeInstance>;
    connections: Connection[];
}
