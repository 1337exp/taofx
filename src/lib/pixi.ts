/**
 * Рантайм для PIXI v8 (рендерер WebGL): граф собирается в GLSL-фильтр спрайта. Нужен pixi.js >= 8.
 */
export { createPixiEffect, type PixiEffect, type PixiEffectOptions } from '../pixi/filter';
export { EffectLoadError } from '../graph/load';
export { createPixiParticles, type PixiParticleEffect, type PixiParticleOptions } from '../pixi/particles';
