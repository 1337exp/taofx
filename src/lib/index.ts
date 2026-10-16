/**
 * Публичный API рантайма: всё, что нужно игре, чтобы показать эффект из редактора. Ничего от редактора (Vue, Pinia, i18n).
 * Нужен three >= 0.186 и `WebGPURenderer` из `three/webgpu`.
 */
export { createEffect, EffectLoadError, type Effect, type EffectOptions } from './effect';

// Тоньше: если нужен только материал или только разбор файла.
export { compile, OUTPUT_NODE, type CompiledSurface, type CompileResult } from '../graph/compile';
export { applySurface, createSurfaceMaterial } from '../graph/material';
export { FORMAT, VERSION, parse as parseEffect, serialize as serializeEffect, type LoadError, type LoadErrorCode, type ParseResult } from '../graph/serialize';

// Собственные ноды и построение графа из кода.
export { defineNode, Registry } from '../graph/registry';
export { createDefaultRegistry } from '../nodes';
export { addNode, canConnect, connect, createGraph, disconnect, removeNode, type ConnectCheck, type ConnectFailure } from '../graph/ops';
export { resolveTypes, type GraphError, type GraphErrorKind, type Resolved } from '../graph/resolve';
export type {
    Connection,
    Constant,
    DataType,
    Graph,
    InputPin,
    NodeDef,
    NodeInstance,
    OutputPin,
    PinRef,
    PinType,
    SavedView,
    Value,
} from '../graph/types';
