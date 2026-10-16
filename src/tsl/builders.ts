import { float, mix, mx_noise_float, normalView, positionViewDirection, select, smoothstep, uv, vec2 } from 'three/tsl';
import type { TslBuild } from './types';

// float растягивается на тип образца: у pow и clamp оба аргумента должны быть одного типа с основным
const like = (sample: any, scalar: any) => sample.mul(0).add(scalar);

/**
 * TSL-реализации встроенных нод по id. Определения нод (`nodes/`) не знают про three, поэтому всё, что строит узлы
 * TSL, собрано здесь: игра без TSL (GLSL, PIXI) этот файл не подключает.
 */
export const tslBuilders: Record<string, TslBuild> = {
    'input/time': (_, { time }) => ({ t: time }),
    'input/uv': () => ({ uv: uv() }),
    'input/radial': () => ({ r: uv().sub(0.5).length().mul(2) }),
    'input/fresnel': ({ power }) => ({ f: normalView.dot(positionViewDirection).saturate().oneMinus().pow(power) }),

    'input/particle': (_, { particle }) => {
        if (!particle) throw new Error('Particle data is only available in a particle system');
        return { ...particle };
    },

    'const/float': ({ value }) => ({ value }),
    'const/color': ({ value }) => ({ color: value }),

    'math/add': ({ a, b }) => ({ result: a.add(b) }),
    'math/multiply': ({ a, b }) => ({ result: a.mul(b) }),
    'math/mix': ({ a, b, t }) => ({ result: mix(a, b, t) }),
    'math/pow': ({ base, exponent }) => ({ result: base.pow(like(base, exponent)) }),
    'math/clamp': ({ x, min, max }) => ({ result: x.max(like(x, min)).min(like(x, max)) }),
    'math/remap': ({ x, inMin, inMax, outMin, outMax }) => {
        // нулевой входной диапазон заменяется на крошечный (как в GLSL-эмиттере)
        const span = inMax.sub(inMin);
        const safe = select(span.abs().lessThan(float(1e-6)), float(1e-6), span);
        return { result: x.sub(inMin).mul(outMax.sub(outMin).div(safe)).add(outMin) };
    },
    'math/sin': ({ x }) => ({ result: x.sin() }),
    'math/smoothstep': ({ low, high, x }) => ({ result: smoothstep(low, high, x) }),

    'noise/perlin': ({ p }) => {
        // та же раскладка координат, что в GLSL-эмиттере: float идёт вдоль линии, vec4 теряет четвёртую компоненту
        switch (p.nodeType) {
            case 'float':
                return { n: mx_noise_float(vec2(p, 0)) };
            case 'vec4':
                return { n: mx_noise_float(p.xyz) };
            default:
                return { n: mx_noise_float(p) };
        }
    },

    'output/surface': () => ({}),
};
