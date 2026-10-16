import { mix } from 'three/tsl';
import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'math/mix',
    title: 'Mix',
    inputs: { a: { type: 'gen', default: 0 }, b: { type: 'gen', default: 1 }, t: { type: 'float', default: 0.5 } },
    outputs: { result: { type: 'gen' } },
    build: ({ a, b, t }) => ({ result: mix(a, b, t) }),
});
