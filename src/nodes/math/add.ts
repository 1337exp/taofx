import { defineNode } from '@/graph/registry';

export default defineNode({
    id: 'math/add',
    title: 'Add',
    inputs: { a: { type: 'gen', default: 0 }, b: { type: 'gen', default: 0 } },
    outputs: { result: { type: 'gen' } },
    build: ({ a, b }) => ({ result: a.add(b) }),
});
