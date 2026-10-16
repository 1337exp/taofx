import { defineNode } from '../../graph/registry';

/** 0 в центре видимой стороны, 1 на краю силуэта: основа свечения по контуру. Нужна нормаль поверхности. */
export default defineNode({
    id: 'input/fresnel',
    title: 'Fresnel',
    inputs: { power: { type: 'float', default: 2 } },
    outputs: { f: { type: 'float' } },
    needs: ['normal'],
    glsl: ({ power }) => ({ f: `pow(1.0 - clamp(dot(vNormalView, vViewDir), 0.0, 1.0), ${power})` }),
});
