import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'math/clamp',
    title: 'Clamp',
    inputs: { x: { type: 'gen', default: 0.5 }, min: { type: 'float', default: 0 }, max: { type: 'float', default: 1 } },
    outputs: { result: { type: 'gen' } },
    glsl: ({ x, min, max }) => ({ result: `clamp(${x}, ${min}, ${max})` }),
    wgsl: ({ x, min, max }) => ({ result: `clamp(${x}, ${x} * 0.0 + ${min}, ${x} * 0.0 + ${max})` }),
});
