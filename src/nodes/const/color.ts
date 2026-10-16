import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'const/color',
    title: 'Color',
    inputs: { value: { type: 'color', default: [1, 1, 1] } },
    outputs: { color: { type: 'color' } },
    glsl: ({ value }) => ({ color: value! }),
});
