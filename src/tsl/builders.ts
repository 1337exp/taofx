import { mix, mx_noise_float, normalView, positionViewDirection, smoothstep, uv, vec2 } from 'three/tsl';
import type { TslBuild } from './types';

/**
 * TSL-реализации встроенных нод по id. Определения нод (`nodes/`) не знают про three, поэтому всё, что строит узлы
 * TSL, собрано здесь: игра без TSL (GLSL, PIXI) этот файл не подключает.
 */
export const tslBuilders: Record<string, TslBuild> = {
    'input/time': (_, { time }) => ({ t: time }),
    'input/uv': () => ({ uv: uv() }),
    'input/fresnel': ({ power }) => ({ f: normalView.dot(positionViewDirection).saturate().oneMinus().pow(power) }),

    'const/float': ({ value }) => ({ value }),
    'const/color': ({ value }) => ({ color: value }),

    'math/add': ({ a, b }) => ({ result: a.add(b) }),
    'math/multiply': ({ a, b }) => ({ result: a.mul(b) }),
    'math/mix': ({ a, b, t }) => ({ result: mix(a, b, t) }),
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
