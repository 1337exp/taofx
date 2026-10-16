import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'input/uv',
    title: 'UV',
    inputs: {},
    outputs: { uv: { type: 'vec2' } },
    glsl: () => ({ uv: 'vUv' }),
});
