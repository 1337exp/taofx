import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'math/pow',
    title: 'Pow',
    inputs: { base: { type: 'gen', default: 0.5 }, exponent: { type: 'float', default: 2 } },
    outputs: { result: { type: 'gen' } },
    // pow в GLSL требует одинаковых типов: float-степень растягиваем на тип основания
    // Отрицательное основание даёт неопределённый результат, как и у самого pow: ограничивайте его заранее (Clamp)
    glsl: ({ base, exponent }) => ({ result: `pow(${base}, ${base} * 0.0 + ${exponent})` }),
    wgsl: ({ base, exponent }) => ({ result: `pow(${base}, ${base} * 0.0 + ${exponent})` }),
});
