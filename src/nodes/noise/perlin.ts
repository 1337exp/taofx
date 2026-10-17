import { MX_NOISE_GLSL } from '../../glsl/mxNoise';
import { defineNode } from '../../graph/registry';
import { MX_NOISE_WGSL } from '../../wgsl/mxNoise';

/**
 * Шум Перлина (MaterialX) в диапазоне примерно −1…1. Координата: float (шум вдоль линии), vec2, vec3;
 * из vec4 берутся первые три компоненты. Одинаково считается в TSL и в GLSL.
 */
export default defineNode({
    id: 'noise/perlin',
    title: 'Perlin noise',
    inputs: { p: { type: 'gen', default: 0 } },
    outputs: { n: { type: 'float' } },
    glsl: ({ p }, ctx) => {
        ctx.helper('mx_noise', MX_NOISE_GLSL);
        switch (ctx.types.p) {
            case 'float':
                return { n: `mx_perlin2(vec2(${p}, 0.0))` };
            case 'vec2':
                return { n: `mx_perlin2(${p})` };
            case 'vec4':
                return { n: `mx_perlin3((${p}).xyz)` };
            default:
                return { n: `mx_perlin3(${p})` };
        }
    },
    wgsl: ({ p }, ctx) => {
        ctx.helper('mx_noise', MX_NOISE_WGSL);
        switch (ctx.types.p) {
            case 'float':
                return { n: `mx_perlin2(vec2<f32>(${p}, 0.0))` };
            case 'vec2':
                return { n: `mx_perlin2(${p})` };
            case 'vec4':
                return { n: `mx_perlin3((${p}).xyz)` };
            default:
                return { n: `mx_perlin3(${p})` };
        }
    },
});
