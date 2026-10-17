import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'input/uv',
    title: 'UV',
    inputs: {},
    outputs: { uv: { type: 'vec2' }, u: { type: 'float', label: 'u' }, v: { type: 'float', label: 'v' } },
    glsl: () => ({ uv: 'vUv', u: 'vUv.x', v: 'vUv.y' }),
    wgsl: () => ({ uv: 'vUv', u: 'vUv.x', v: 'vUv.y' }),
});
