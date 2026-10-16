import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'math/multiply',
    title: 'Multiply',
    inputs: { a: { type: 'gen', default: 1 }, b: { type: 'gen', default: 1 } },
    outputs: { result: { type: 'gen' } },
    glsl: ({ a, b }) => ({ result: `(${a} * ${b})` }),
});
