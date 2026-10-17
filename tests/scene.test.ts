import { describe, expect, it } from 'vitest';
import { compileGlsl } from '@/glsl/compile';
import { buildThreeParticleShader } from '@/glsl/particleTargets';
import type { Graph } from '@/graph/types';
import { createDefaultRegistry } from '@/nodes';
import { compile } from '@/tsl/compile';

const registry = createDefaultRegistry();
const node = (id: string, type: string, values: Graph['nodes'][string]['values'] = {}) => ({ id, type, x: 0, y: 0, values });
const link = (id: string, from: string, fromPin: string, to: string, toPin: string) => ({ id, from: { node: from, pin: fromPin }, to: { node: to, pin: toPin } });

/** Мягкая частица: непрозрачность · затухание у геометрии; цвет = цвет сцены за частицей со сдвигом (рефракция). */
const graph: Graph = {
    nodes: {
        p: node('p', 'input/particle'),
        soft: node('soft', 'scene/depth-fade', { distance: 0.8 }),
        alpha: node('alpha', 'math/multiply'),
        behind: node('behind', 'scene/scene-color', { offset: [0.01, 0.02] }),
        out: node('out', 'output/surface'),
    },
    connections: [link('1', 'soft', 'fade', 'alpha', 'a'), link('2', 'p', 'alpha', 'alpha', 'b'), link('3', 'alpha', 'result', 'out', 'opacity'), link('4', 'behind', 'color', 'out', 'color')],
};

describe('ноды сцены: возможности цели', () => {
    it('TSL (WebGPURenderer) даёт глубину и цвет сцены сам', () => {
        const r = compile(graph, registry, undefined, { particle: { age: 0, random: 0, tint: 0, alpha: 0 } });
        expect(r.errors).toEqual([]);
        expect(r.surface).not.toBeNull();
    });

    it('классический WebGL без текстур от игры: понятная ошибка на каждую ноду', () => {
        const r = compileGlsl(graph, registry, 'three-particles');
        expect(r.program).toBeNull();
        expect(r.errors.map((e) => e.message).sort()).toEqual(['Depth fade needs depth, which the three-particles target does not provide', 'Scene color needs sceneColor, which the three-particles target does not provide']);
    });

    it('игра отдала глубину и цвет: собирается, uniform размера объявлен один раз', () => {
        const r = compileGlsl(graph, registry, 'three-particles', ['depth', 'sceneColor']);
        expect(r.errors).toEqual([]);
        const code = r.program!.helpers;
        expect(code.match(/uniform vec2 uSceneSize;/g)).toHaveLength(1);
        expect(code).toContain('float fxSceneViewDepth()');
        expect(code).toContain('vec3 fxSceneColor(vec2 offset)');
        expect(r.program!.body).toContain('fxSceneViewDepth() - vViewDepth');
    });

    it('игра отдала только глубину: цвет сцены по-прежнему не собирается', () => {
        const r = compileGlsl(graph, registry, 'three-particles', ['depth']);
        expect(r.errors.map((e) => e.nodeId)).toEqual(['behind']);
    });

    it('PIXI (2D, нет ни глубины, ни цвета позади) отказывает', () => {
        const r = compileGlsl(graph, registry, 'pixi-particles');
        expect(r.program).toBeNull();
        expect(r.errors).toHaveLength(2);
    });

    it('шейдер частиц передаёт глубину пикселя во фрагментный шейдер во всех режимах', () => {
        const r = compileGlsl(graph, registry, 'three-particles', ['depth', 'sceneColor']);
        for (const mode of ['billboard', 'stretch', 'ribbon'] as const) {
            const { vertexShader, fragmentShader } = buildThreeParticleShader(r.program!, mode);
            expect(vertexShader).toContain('vViewDepth = -mv.z;');
            expect(fragmentShader).toContain('varying float vViewDepth;');
        }
    });
});
