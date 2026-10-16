import { uv } from 'three/tsl';
import { defineNode } from '@/graph/registry';

export default defineNode({
    id: 'input/uv',
    title: 'UV',
    inputs: {},
    outputs: { uv: { type: 'vec2' } },
    build: () => ({ uv: uv() }),
});
