import { time } from 'three/tsl';
import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'input/time',
    title: 'Time',
    inputs: {},
    outputs: { t: { type: 'float' } },
    build: () => ({ t: time }),
});
