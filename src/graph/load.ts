import type { Registry } from './registry';
import { parse, type LoadError } from './serialize';
import type { Graph } from './types';

/** Файл эффекта не удалось прочитать: причина в `error.code` (`invalidJson`, `notTaofxFile`, `newerVersion`, ...). */
export class EffectLoadError extends Error {
    constructor(readonly error: LoadError) {
        super(`Cannot load effect: ${error.code}${error.detail ? ` (${error.detail})` : ''}`);
        this.name = 'EffectLoadError';
    }
}

/** Граф из текста файла редактора (строгий разбор, бросает `EffectLoadError`) или готовый граф как есть. */
export function loadGraph(source: string | Graph, registry: Registry): Graph {
    if (typeof source !== 'string') return source;
    const result = parse(source, registry);
    if (!result.ok) throw new EffectLoadError(result.error);
    return result.graph;
}
