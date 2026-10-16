import { mx_noise_float } from 'three/tsl';
import { defineNode } from '../../graph/registry';

/** Шум Перлина (MaterialX) в диапазоне примерно −1…1; координата — float, vec2 или vec3. */
export default defineNode({
    id: 'noise/perlin',
    title: 'Perlin noise',
    inputs: { p: { type: 'gen', default: 0 } },
    outputs: { n: { type: 'float' } },
    build: ({ p }) => ({ n: mx_noise_float(p) }),
});
