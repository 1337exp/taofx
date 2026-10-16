import { defineNode } from '../../graph/registry';

/** Расстояние от центра квадрата (0.5, 0.5) в долях радиуса: 0 в центре, 1 на середине стороны. Основа круглых и мягких пятен. */
export default defineNode({
    id: 'input/radial',
    title: 'Radial',
    inputs: {},
    outputs: { r: { type: 'float' } },
    glsl: () => ({ r: 'length(vUv - 0.5) * 2.0' }),
});
