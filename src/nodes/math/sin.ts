import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'math/sin',
    title: 'Sin',
    inputs: { x: { type: 'gen', default: 0 } },
    outputs: { result: { type: 'gen' } },
    build: ({ x }) => ({ result: x.sin() }),
});
