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
    GraphTexture,
    InputPin,
    NodeDef,
    NodeInstance,
    OutputPin,
    ParamDef,
    PinRef,
    PinType,
    SavedView,
} from '../graph/types';

// WGSL: то же для рендерера WebGPU (PIXI).
export { compileWgsl, WGSL_CAPABILITIES, wgslCast, wgslConstant, wgslFloat, wgslType, type WgslProgram, type WgslResult, type WgslTarget } from '../wgsl/compile';
export { buildPixiWgslFilter, buildPixiWgslParticles } from '../wgsl/targets';
export type { WgslContext, WgslEmit } from '../graph/types';

// GLSL: сборка графа в шейдер и каркасы для целей.
export { compileGlsl, GLSL_CAPABILITIES, glslCast, glslConstant, glslFloat, glslType, type GlslProgram, type GlslResult, type GlslTarget } from '../glsl/compile';
export { buildPixiFragment, buildThreeShader, TIME_UNIFORM, type ThreeShaderSource } from '../glsl/targets';

// Частицы: модель, детерминированная симуляция, формат файла.
export { createBuffers, createSimulation, trailStrideOf, type Simulation } from '../particles/sim';
export { estimateFill, measureSystem, type BudgetOptions, type BudgetReport, type FillView } from '../particles/budget';
export { createDriver3D, type Driver3D, type Prepared } from '../particles/driver';
export { buildQuads2D, buildRibbon2D, buildRibbon3D, createSorter, viewInObject, type MeshBuffers, type ViewPoint } from '../particles/geometry';
export { defaultRender, defaultSystem, parseParticles, serializeParticles, PARTICLES_FORMAT, PARTICLES_VERSION, type ParticleParseResult } from '../particles/serialize';
export { loadParticleFile } from '../particles/load';
export { evalCurve, evalGradient, sampleRange } from '../particles/curve';
export type { Burst, Collider, Curve, CurvePoint, EmitterDef, Force, GradientStop, ParticleBuffers, ParticleDef, ParticleFile, Range, RenderDef, RenderMode, Shape, SystemDef, TrailDef, Vec3 } from '../particles/types';
export { buildPixiParticleShaders, buildThreeParticleShader, STRETCH_UNIFORM, type ParticleShaderSource } from '../glsl/particleTargets';
export { SCENE_CAMERA_UNIFORM, SCENE_COLOR_UNIFORM, SCENE_DEPTH_UNIFORM, SCENE_SIZE_UNIFORM } from '../glsl/scene';
