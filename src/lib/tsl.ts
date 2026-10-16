/**
 * Рантайм для three.js с `WebGPURenderer` (`three/webgpu`, он сам откатывается на WebGL2): граф собирается в узлы TSL.
 * Нужны three >= 0.186.
 */
export { createEffect, type Effect, type EffectOptions } from '../tsl/effect';
export { EffectLoadError } from '../graph/load';
export { compile, TSL_CAPABILITIES, type CompiledSurface, type CompileResult } from '../tsl/compile';
export { applySurface, createSurfaceMaterial } from '../tsl/material';
export { tslBuilders } from '../tsl/builders';
export type { TslBuild, TslContext, TslValue } from '../tsl/types';
export { createParticles, type ParticleEffect, type ParticleEffectOptions } from '../tsl/particles';
export { clearTextureCache, loadTexture } from '../tsl/textures';
