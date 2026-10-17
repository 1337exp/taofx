import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'uv/transform',
    title: 'UV transform',
    inputs: {
        uv: { type: 'vec2', fallback: 'uv' },
        tiling: { type: 'vec2', default: [1, 1] },
        offset: { type: 'vec2', default: [0, 0] },
    },
    outputs: { uv: { type: 'vec2' } },
    // uv * tiling + offset: повтор и сдвиг (подайте время в offset, чтобы текстура ехала)
    glsl: ({ uv, tiling, offset }) => ({ uv: `${uv} * ${tiling} + ${offset}` }),
    wgsl: ({ uv, tiling, offset }) => ({ uv: `${uv} * ${tiling} + ${offset}` }),
});
