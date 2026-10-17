import { defineNode } from '../../graph/registry';

/**
 * Данные частицы, которой принадлежит этот пиксель: доля жизни, случайное число, цвет и непрозрачность из градиента
 * системы. Работает только в системе частиц: у обычного материала и фильтра PIXI такого понятия нет.
 */
export default defineNode({
    id: 'input/particle',
    title: 'Particle',
    inputs: {},
    outputs: { age: { type: 'float' }, random: { type: 'float' }, tint: { type: 'color' }, alpha: { type: 'float' } },
    needs: ['particle'],
    glsl: () => ({ age: 'vAge', random: 'vRand', tint: 'vTint', alpha: 'vAlpha' }),
    wgsl: () => ({ age: 'vAge', random: 'vRand', tint: 'vTint', alpha: 'vAlpha' }),
});
