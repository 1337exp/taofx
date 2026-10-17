import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'input/time',
    title: 'Time',
    inputs: {},
    outputs: { t: { type: 'float' } },
    glsl: () => ({ t: 'uTime' }),
    wgsl: () => ({ t: 'uTime' }),
});
