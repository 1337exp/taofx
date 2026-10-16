import { normalView, positionViewDirection } from 'three/tsl';
import { defineNode } from '../../graph/registry';

/** 0 в центре видимой стороны, 1 на краю силуэта: основа свечения по контуру. */
export default defineNode({
    id: 'input/fresnel',
    title: 'Fresnel',
    inputs: { power: { type: 'float', default: 2 } },
    outputs: { f: { type: 'float' } },
    build: ({ power }) => ({ f: normalView.dot(positionViewDirection).saturate().oneMinus().pow(power) }),
});
