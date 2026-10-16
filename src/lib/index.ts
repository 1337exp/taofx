/**
 * Ядро рантайма: граф эффекта (чистые данные), разбор файла редактора, правила связей, сборка в GLSL.
 * Не тянет ни three, ни PIXI: рендерер выбирается отдельным входом.
 *
 *   @1337exp/taofx/tsl    материал TSL для three.js с WebGPURenderer
 *   @1337exp/taofx/three  ShaderMaterial (GLSL) для three.js с классическим WebGLRenderer
 *   @1337exp/taofx/pixi   фильтр PIXI v8 (WebGL)
 */
export { EffectLoadError, loadGraph } from '../graph/load';
export { FORMAT, VERSION, parse as parseEffect, serialize as serializeEffect, type LoadError, type LoadErrorCode, type ParseResult } from '../graph/serialize';

// Собственные ноды и построение графа из кода.
export { defineNode, Registry } from '../graph/registry';
export { createDefaultRegistry } from '../nodes';
export { addNode, canConnect, connect, createGraph, disconnect, removeNode, type ConnectCheck, type ConnectFailure } from '../graph/ops';
export { resolveTypes, type GraphError, type GraphErrorKind, type Resolved } from '../graph/resolve';
export { checkCapabilities, upstreamOf } from '../graph/capabilities';
export { OUTPUT_NODE } from '../graph/types';
export type {
    Capability,
    Connection,
    Constant,
    DataType,
    GlslContext,
    GlslEmit,
    Graph,
    InputPin,
    NodeDef,
    NodeInstance,
    OutputPin,
    PinRef,
    PinType,
    SavedView,
} from '../graph/types';

// GLSL: сборка графа в шейдер и каркасы для целей.
export { compileGlsl, GLSL_CAPABILITIES, glslCast, glslConstant, glslFloat, glslType, type GlslProgram, type GlslResult, type GlslTarget } from '../glsl/compile';
export { buildPixiFragment, buildThreeShader, TIME_UNIFORM, type ThreeShaderSource } from '../glsl/targets';
