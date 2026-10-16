import { describe, expect, it } from 'vitest';
import { DEMO_GRAPH } from '@/demo';
import { buildPixiFragment, buildThreeShader, compileGlsl, glslCast, glslConstant, glslFloat, glslType } from '@/lib';
import type { Graph } from '@/graph/types';
import { createDefaultRegistry } from '@/nodes';

const registry = createDefaultRegistry();

const node = (id: string, type: string, values: Graph['nodes'][string]['values'] = {}) => ({ id, type, x: 0, y: 0, values });
const link = (id: string, from: string, fromPin: string, to: string, toPin: string) => ({ id, from: { node: from, pin: fromPin }, to: { node: to, pin: toPin } });
const graph = (nodes: Graph['nodes'], connections: Graph['connections'] = []): Graph => ({ nodes, connections });

describe('литералы и приведение типов', () => {
    it('числа всегда с десятичной точкой, без NaN и бесконечностей', () => {
        expect(glslFloat(2)).toBe('2.0');
        expect(glslFloat(-0.25)).toBe('-0.25');
        expect(glslFloat(1e-7)).toBe('1e-7');
        expect(glslFloat(NaN)).toBe('0.0');
        expect(glslFloat(Infinity)).toBe('0.0');
    });

    it('константы нужного типа: число растягивается, недостающие компоненты нули', () => {
        expect(glslConstant('float', 3)).toBe('3.0');
        expect(glslConstant('vec2', 0.5)).toBe('vec2(0.5, 0.5)');
        expect(glslConstant('vec3', [1, 2])).toBe('vec3(1.0, 2.0, 0.0)');
        expect(glslConstant('color', [0.1, 0.2, 0.3])).toBe('vec3(0.1, 0.2, 0.3)');
        expect(glslConstant('vec4', 1)).toBe('vec4(1.0, 1.0, 1.0, 1.0)');
        expect(glslConstant('vec3', undefined)).toBe('vec3(0.0, 0.0, 0.0)');
    });

    it('float растягивается на все компоненты, тот же размер остаётся, сужение бросает', () => {
        expect(glslCast('x', 'float', 'vec3')).toBe('vec3(x)');
        expect(glslCast('x', 'vec3', 'color')).toBe('x');
        expect(glslCast('x', 'color', 'vec3')).toBe('x');
        expect(() => glslCast('x', 'vec3', 'vec2')).toThrow(/narrow/);
        expect(glslType('color')).toBe('vec3');
    });
});

describe('compileGlsl', () => {
    it('демо-граф собирается для three: переменные по порядку зависимостей, итог в fxColor и fxOpacity', () => {
        const { program, errors } = compileGlsl(DEMO_GRAPH, registry, 'three');
        expect(errors).toEqual([]);
        const body = program!.body;
        expect(body).toMatch(/vec3 fxColor = n\d+_color;|vec3 fxColor = n\d+_result;/);
        expect(body).toContain('float fxOpacity = 1.0;');
        expect(body).toContain('uTime');
        expect(body).toContain('vUv');
        expect(body).toContain('mx_perlin2('); // координата шума vec2 (uv * 5 + время)
        expect(program!.helpers).toContain('float mx_perlin2(vec2 p)');
        // переменная объявлена раньше, чем использована
        const declared = [...body.matchAll(/(?:float|vec[234]) (n\d+_\w+) =/g)].map((m) => m[1]!);
        for (const [i, line] of body.split('\n').entries()) {
            for (const used of line.match(/\bn\d+_\w+\b/g) ?? []) {
                if (declared.indexOf(used) > -1 && !line.includes(`${used} =`)) {
                    expect(body.split('\n').slice(0, i).some((l) => l.includes(`${used} =`)), `${used} используется до объявления`).toBe(true);
                }
            }
        }
    });

    it('нода с несколькими потребителями считается один раз', () => {
        const g = graph(
            { t: node('t', 'input/time'), m: node('m', 'math/multiply'), out: node('out', 'output/surface') },
            [link('1', 't', 't', 'm', 'a'), link('2', 't', 't', 'm', 'b'), link('3', 'm', 'result', 'out', 'opacity')],
        );
        const { program } = compileGlsl(g, registry, 'three');
        expect(program!.body.match(/= uTime;/g)).toHaveLength(1);
    });

    it('шум выбирает 2D или 3D по типу координаты, float идёт вдоль линии', () => {
        const noise = (inputType: string) => {
            const nodes: Graph['nodes'] = { n: node('n', 'noise/perlin'), out: node('out', 'output/surface') };
            const connections = [link('c', 'n', 'n', 'out', 'opacity')];
            if (inputType === 'vec2') {
                nodes.uv = node('uv', 'input/uv');
                connections.push(link('u', 'uv', 'uv', 'n', 'p'));
            } else if (inputType === 'vec3') {
                nodes.c3 = node('c3', 'const/color');
                connections.push(link('u', 'c3', 'color', 'n', 'p'));
            }
            return compileGlsl(graph(nodes, connections), registry, 'three').program!.body;
        };
        expect(noise('float')).toMatch(/mx_perlin2\(vec2\(0\.0, 0\.0\)\)/);
        expect(noise('vec2')).toMatch(/mx_perlin2\(n\d+_uv\)/);
        expect(noise('vec3')).toMatch(/mx_perlin3\(n\d+_color\)/);
    });

    it('граф без выхода и неизвестная нода без GLSL дают ошибки, а не исключения', () => {
        expect(compileGlsl(graph({ t: node('t', 'input/time') }), registry, 'three').errors[0]!.kind).toBe('noOutput');

        const bare = createDefaultRegistry();
        bare.register({ id: 'custom/noglsl', title: 'No GLSL', inputs: {}, outputs: { v: { type: 'float' } } });
        const g = graph({ c: node('c', 'custom/noglsl'), out: node('out', 'output/surface') }, [link('1', 'c', 'v', 'out', 'opacity')]);
        const r = compileGlsl(g, bare, 'three');
        expect(r.program).toBeNull();
        expect(r.errors[0]).toMatchObject({ kind: 'unsupported', nodeId: 'c' });
    });

    it('исключение в эмиттере попадает в errors с id ноды', () => {
        const broken = createDefaultRegistry();
        broken.register({
            id: 'custom/boom',
            title: 'Boom',
            inputs: {},
            outputs: { v: { type: 'float' } },
            glsl: () => {
                throw new Error('boom');
            },
        });
        const g = graph({ c: node('c', 'custom/boom'), out: node('out', 'output/surface') }, [link('1', 'c', 'v', 'out', 'opacity')]);
        expect(compileGlsl(g, broken, 'three').errors[0]).toMatchObject({ kind: 'build', nodeId: 'c', message: 'boom' });
    });
});

describe('возможности цели', () => {
    const fresnelGraph = graph({ f: node('f', 'input/fresnel'), out: node('out', 'output/surface') }, [link('1', 'f', 'f', 'out', 'opacity')]);
    const sourceGraph = graph({ s: node('s', 'input/source'), out: node('out', 'output/surface') }, [link('1', 's', 'color', 'out', 'color'), link('2', 's', 'alpha', 'out', 'opacity')]);

    it('френель (нужна нормаль) собирается для three и не собирается для pixi', () => {
        expect(compileGlsl(fresnelGraph, registry, 'three').errors).toEqual([]);
        const r = compileGlsl(fresnelGraph, registry, 'pixi');
        expect(r.program).toBeNull();
        expect(r.errors[0]).toMatchObject({ kind: 'unsupported', nodeId: 'f' });
        expect(r.errors[0]!.message).toMatch(/normal/);
    });

    it('исходная картинка (нужен source) собирается для pixi и не собирается для three', () => {
        const ok = compileGlsl(sourceGraph, registry, 'pixi');
        expect(ok.errors).toEqual([]);
        expect(ok.program!.body).toContain('fxSrcRgb');
        expect(compileGlsl(sourceGraph, registry, 'three').errors[0]).toMatchObject({ kind: 'unsupported', nodeId: 's' });
    });
});

describe('каркасы целей', () => {
    const { program } = compileGlsl(DEMO_GRAPH, registry, 'three');

    it('three: вершинный шейдер отдаёт uv, нормаль и взгляд, фрагментный пишет цвет с переводом в sRGB', () => {
        const { vertexShader, fragmentShader } = buildThreeShader(program!);
        for (const name of ['vUv', 'vNormalView', 'vViewDir']) {
            expect(vertexShader).toContain(`varying ${name === 'vUv' ? 'vec2' : 'vec3'} ${name};`);
            expect(fragmentShader).toContain(`varying ${name === 'vUv' ? 'vec2' : 'vec3'} ${name};`);
        }
        expect(fragmentShader).toContain('uniform float uTime;');
        expect(fragmentShader).toContain('gl_FragColor = vec4(fxColor, fxOpacity);');
        expect(fragmentShader).toContain('#include <colorspace_fragment>');
        expect(fragmentShader).toContain(program!.helpers);
    });

    it('pixi: эффект внутри силуэта спрайта, премультипликация, sRGB, uv перевёрнут', () => {
        const fragment = buildPixiFragment(compileGlsl(DEMO_GRAPH, registry, 'pixi').program ?? { ...program!, target: 'pixi' });
        expect(fragment.startsWith('#version 300 es')).toBe(true);
        expect(fragment).toContain('uniform sampler2D uTexture;');
        expect(fragment).toContain('float a = fxOpacity * fxSrc.a;');
        expect(fragment).toContain('finalColor = vec4(fxLinearToSrgb(fxColor) * a, a);');
        expect(fragment).toContain('1.0 - vTextureCoord.y');
    });
});
