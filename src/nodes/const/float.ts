import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'const/float',
    title: 'Float',
    inputs: { value: { type: 'float', default: 0 } },
    outputs: { value: { type: 'float' } },
    glsl: ({ value }) => ({ value: value! }),
});
