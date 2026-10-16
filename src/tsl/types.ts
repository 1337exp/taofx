import type { Texture } from 'three/webgpu';

/**
 * Значение в скомпилированном графе TSL. Для ядра оно непрозрачно: его создают и потребляют только
 * TSL-реализации нод и компилятор.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TslValue = any;

/** Что получает TSL-реализация ноды, кроме значений входов. */
export interface TslContext {
    /** Параметры ноды (`NodeInstance.params`). */
    params: Readonly<Record<string, string>>;
    /** Текстура по имени из графа; нет такой — ошибка сборки ноды. */
    texture(name: string): Texture;
    /** Время эффекта в секундах: uniform, которым управляет игра (`effect.setTime`), а не часы three.js. Так время можно перематывать. */
    time: TslValue;
    /** Есть только при сборке системы частиц. */
    particle?: TslParticleInputs;
}

/** Данные частицы для ноды «Частица»: узлы, читающие инстансные атрибуты. */
export interface TslParticleInputs {
    age: TslValue;
    random: TslValue;
    tint: TslValue;
    alpha: TslValue;
}

export type TslBuild = (inputs: Record<string, TslValue>, ctx: TslContext) => Record<string, TslValue>;
