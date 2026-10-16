import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'math/remap',
    title: 'Remap',
    inputs: {
        x: { type: 'gen', default: 0.5 },
        inMin: { type: 'float', default: 0 },
        inMax: { type: 'float', default: 1 },
        outMin: { type: 'float', default: 0 },
        outMax: { type: 'float', default: 1 },
    },
    outputs: { result: { type: 'gen' } },
    // Значение переносится линейно из [inMin, inMax] в [outMin, outMax] и не обрезается за краями (обрезка: Clamp).
    // Нулевой входной диапазон заменяется на крошечный, чтобы не получить деление на ноль.
    glsl: ({ x, inMin, inMax, outMin, outMax }) => ({
        result: `${outMin} + (${x} - ${inMin}) * ((${outMax} - ${outMin}) / (abs(${inMax} - ${inMin}) < 1e-6 ? 1e-6 : (${inMax} - ${inMin})))`,
    }),
});
