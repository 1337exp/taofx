/**
 * Рантайм для three.js с классическим `WebGLRenderer`: граф собирается в GLSL (`ShaderMaterial`), без TSL.
 * Нужны three >= 0.186.
 */
export { createGlslEffect, type GlslEffect, type GlslEffectOptions } from '../three/glsl';
export { EffectLoadError } from '../graph/load';
export { createGlslParticles, type GlslParticleEffect, type GlslParticleOptions } from '../three/particles';
export { clearTextureCache, loadTexture } from '../three/textures';
