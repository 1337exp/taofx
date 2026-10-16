import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'math/smoothstep',
    title: 'Smoothstep',
    inputs: { low: { type: 'float', default: 0 }, high: { type: 'float', default: 1 }, x: { type: 'float', default: 0.5 } },
    outputs: { result: { type: 'float' } },
    glsl: ({ low, high, x }) => ({ result: `smoothstep(${low}, ${high}, ${x})` }),
});
