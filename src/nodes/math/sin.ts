import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'math/sin',
    title: 'Sin',
    inputs: { x: { type: 'gen', default: 0 } },
    outputs: { result: { type: 'gen' } },
    glsl: ({ x }) => ({ result: `sin(${x})` }),
    wgsl: ({ x }) => ({ result: `sin(${x})` }),
});
