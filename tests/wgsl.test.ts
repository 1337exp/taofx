import { describe, expect, it } from 'vitest';
import { compileGlsl } from '@/glsl/compile';
import type { Graph } from '@/graph/types';
import { createDefaultRegistry } from '@/nodes';
import { compileWgsl, wgslCast, wgslConstant, wgslFloat } from '@/wgsl/compile';
import { buildPixiWgslFilter, buildPixiWgslParticles } from '@/wgsl/targets';

const registry = createDefaultRegistry();
const node = (id: string, type: string, values: Graph['nodes'][string]['values'] = {}, params?: Record<string, string>) => ({ id, type, x: 0, y: 0, values, params });
const link = (id: string, from: string, fromPin: string, to: string, toPin: string) => ({ id, from: { node: from, pin: fromPin }, to: { node: to, pin: toPin } });

/** Граф, который собирается и для PIXI: шум, смешивание цветов, синус, радиальная маска, ограничение и переназначение. */
const PIXI_GRAPH: Graph = {
    nodes: {
        time: node('time', 'input/time'),
        uv: node('uv', 'input/uv'),
        noise: node('noise', 'noise/perlin'),
        remap: node('remap', 'math/remap', { inMin: -1, inMax: 1 }),
        clamp: node('clamp', 'math/clamp'),
        ca: node('ca', 'const/color', { value: [1, 0.3, 0.1] }),
        cb: node('cb', 'const/color', { value: [0.1, 0.4, 1] }),
        mix: node('mix', 'math/mix'),
        sn: node('sn', 'math/sin'),
        ss: node('ss', 'math/smoothstep', { low: -1, high: 1 }),
        rad: node('rad', 'input/radial'),
        pw: node('pw', 'math/pow', { exponent: 2 }),
        mul: node('mul', 'math/multiply'),
        out: node('out', 'output/surface'),
    },
    connections: [
        link('1', 'uv', 'uv', 'noise', 'p'),
        link('2', 'noise', 'n', 'remap', 'x'),
        link('3', 'remap', 'result', 'clamp', 'x'),
        link('4', 'clamp', 'result', 'mix', 't'),
        link('5', 'ca', 'color', 'mix', 'a'),
        link('6', 'cb', 'color', 'mix', 'b'),
        link('7', 'time', 't', 'sn', 'x'),
        link('8', 'sn', 'result', 'ss', 'x'),
        link('9', 'rad', 'r', 'pw', 'base'),
        link('10', 'ss', 'result', 'mul', 'a'),
        link('11', 'pw', 'result', 'mul', 'b'),
        link('12', 'mix', 'result', 'out', 'color'),
        link('13', 'mul', 'result', 'out', 'opacity'),
    ],
};

describe('WGSL: значения', () => {
    it('числа и константы пишутся по правилам WGSL', () => {
        expect(wgslFloat(1)).toBe('1.0');
        expect(wgslFloat(0.5)).toBe('0.5');
        expect(wgslFloat(1e-7)).toBe('1e-7');
        expect(wgslFloat(NaN)).toBe('0.0');
        expect(wgslConstant('vec3', [1, 0.5, 0])).toBe('vec3<f32>(1.0, 0.5, 0.0)');
        expect(wgslConstant('float', 2)).toBe('2.0');
        expect(wgslConstant('vec4', 1)).toBe('vec4<f32>(1.0, 1.0, 1.0, 1.0)');
        expect(wgslCast('x', 'float', 'vec3')).toBe('vec3<f32>(x)');
        expect(wgslCast('x', 'vec3', 'color')).toBe('x');
        expect(() => wgslCast('x', 'vec3', 'vec2')).toThrow();
    });
});

describe('WGSL: ноды', () => {
    it('у каждой ноды есть WGSL, если она не требует того, чего у PIXI нет', () => {
        const pixiHas = new Set(['source', 'particle']);
        for (const def of registry.all()) {
            const needsMissing = (def.needs ?? []).some((c) => !pixiHas.has(c));
            if (!needsMissing) expect(def.wgsl, def.id).toBeTypeOf('function');
        }
    });

    it('демо-граф собирается в WGSL: let-значения со своими типами, без синтаксиса GLSL', () => {
        const r = compileWgsl(PIXI_GRAPH, registry, 'pixi');
        expect(r.errors).toEqual([]);
        const body = r.program!.body;
        expect(body).toMatch(/let n0_\w+: (f32|vec[234]<f32>) = /);
        expect(body).toContain('let fxColor: vec3<f32> =');
        expect(body).toContain('let fxOpacity: f32 =');
        expect(body).not.toMatch(/\bfloat\b|\bvec[234]\(|\?/); // ни float, ни vec3(…) без <f32>, ни тернарного оператора
        expect(r.program!.helpers).toContain('fn mx_perlin2'); // координата vec2
    });

    it('те же ошибки возможностей, что у GLSL: Френель на PIXI не собирается', () => {
        const g: Graph = { nodes: { f: node('f', 'input/fresnel'), out: node('out', 'output/surface') }, connections: [link('1', 'f', 'f', 'out', 'opacity')] };
        const wgsl = compileWgsl(g, registry, 'pixi');
        const glsl = compileGlsl(g, registry, 'pixi');
        expect(wgsl.program).toBeNull();
        expect(wgsl.errors.map((e) => e.nodeId)).toEqual(glsl.errors.map((e) => e.nodeId));
        expect(wgsl.errors[0]!.message).toContain('needs normal');
    });

    it('нода без WGSL даёт ошибку для WebGPU, а GLSL при этом собирается', () => {
        const custom = createDefaultRegistry();
        custom.register({ id: 'my/glslOnly', title: 'GLSL only', inputs: {}, outputs: { v: { type: 'float' } }, glsl: () => ({ v: '0.5' }) });
        const g: Graph = { nodes: { n: node('n', 'my/glslOnly'), out: node('out', 'output/surface') }, connections: [link('1', 'n', 'v', 'out', 'opacity')] };
        expect(compileGlsl(g, custom, 'pixi').errors).toEqual([]);
        const r = compileWgsl(g, custom, 'pixi');
        expect(r.program).toBeNull();
        expect(r.errors[0]!.message).toBe('Node "my/glslOnly" has no WGSL implementation');
    });

    it('текстуры: картинка и сэмплер в паре, один раз на текстуру', () => {
        const g: Graph = {
            nodes: { t: node('t', 'input/texture', {}, { texture: 'a' }), t2: node('t2', 'input/texture', {}, { texture: 'a' }), m: node('m', 'math/multiply'), out: node('out', 'output/surface') },
            connections: [link('1', 't', 'alpha', 'm', 'a'), link('2', 't2', 'alpha', 'm', 'b'), link('3', 'm', 'result', 'out', 'opacity')],
            textures: { a: { src: 'data:image/png;base64,AAAA' } },
        };
        const r = compileWgsl(g, registry, 'pixi');
        expect(r.errors).toEqual([]);
        expect(r.program!.samplers).toEqual([{ uniform: 'uTex0', texture: 'a' }]);
        expect(r.program!.body).toContain('fxTex(uTex0, uTex0Sampler, vUv)');
        expect(r.program!.helpers).toContain('fn fxTex(t: texture_2d<f32>, s: sampler');
    });
});

describe('WGSL: каркасы', () => {
    const program = compileWgsl(PIXI_GRAPH, registry, 'pixi').program!;

    it('фильтр: точки входа, группы PIXI и перевод в sRGB с премультипликацией', () => {
        const src = buildPixiWgslFilter(program);
        expect(src).toContain('fn mainVertex(');
        expect(src).toContain('fn mainFragment(');
        expect(src).toContain('@group(0) @binding(1) var uTexture: texture_2d<f32>;');
        expect(src).toContain('@group(1) @binding(0) var<uniform> fxUniforms: FxUniforms;');
        expect(src).toContain('let a = fxOpacity * fxSrc.a;');
        expect(src).toContain('fxLinearToSrgb(fxColor) * a');
    });

    it('частицы: глобальные и локальные uniform PIXI по их именам, свои ресурсы в группе 2, атрибуты по именам геометрии', () => {
        const graph: Graph = {
            nodes: { p: node('p', 'input/particle'), t: node('t', 'input/texture', {}, { texture: 'a' }), out: node('out', 'output/surface') },
            connections: [link('1', 'p', 'tint', 'out', 'color'), link('2', 't', 'alpha', 'out', 'opacity')],
            textures: { a: { src: 'data:image/png;base64,AAAA' } },
        };
        const r = compileWgsl(graph, registry, 'pixi-particles');
        expect(r.errors).toEqual([]);
        const src = buildPixiWgslParticles(r.program!);
        expect(src).toContain('@group(0) @binding(0) var<uniform> globalUniforms: GlobalUniforms;');
        expect(src).toContain('@group(1) @binding(0) var<uniform> localUniforms: LocalUniforms;');
        expect(src).toContain('@group(2) @binding(0) var<uniform> fxUniforms: FxUniforms;');
        expect(src).toContain('@group(2) @binding(1) var uTex0: texture_2d<f32>;');
        expect(src).toContain('@group(2) @binding(2) var uTex0Sampler: sampler;');
        for (const a of ['aPosition', 'aUV', 'aAge', 'aRand', 'aTint', 'aAlpha']) expect(src).toContain(a);
        expect(r.program!.body).toContain('vTint');
    });

    it('«Частица» не собирается для обычного фильтра', () => {
        const g: Graph = { nodes: { p: node('p', 'input/particle'), out: node('out', 'output/surface') }, connections: [link('1', 'p', 'alpha', 'out', 'opacity')] };
        expect(compileWgsl(g, registry, 'pixi').program).toBeNull();
    });
});
