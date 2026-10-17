import { defineNode } from '../../graph/registry';

/** Исходная картинка, к которой применён эффект (спрайт под фильтром PIXI). Нужна цель, у которой есть картинка. */
export default defineNode({
    id: 'input/source',
    title: 'Source image',
    inputs: {},
    outputs: { color: { type: 'color' }, alpha: { type: 'float' } },
    needs: ['source'],
    glsl: () => ({ color: 'fxSrcRgb', alpha: 'fxSrc.a' }),
    wgsl: () => ({ color: 'fxSrcRgb', alpha: 'fxSrc.a' }),
});
