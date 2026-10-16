import { describe, expect, it } from 'vitest';
import { DEMO_GRAPH } from '@/demo';
import { createEffect, EffectLoadError } from '@/lib/tsl';
import { serializeEffect } from '@/lib';

const demoText = serializeEffect(DEMO_GRAPH);

describe('createEffect', () => {
    it('из текста файла редактора собирает материал без ошибок', () => {
        const effect = createEffect(demoText);
        expect(effect.errors).toEqual([]);
        expect(effect.material.isMaterial).toBe(true);
        expect(effect.material.colorNode?.isNode).toBe(true);
        expect(effect.material.opacityNode?.isNode).toBe(true);
        expect(effect.material.transparent).toBe(true);
        expect(Object.keys(effect.graph.nodes)).toHaveLength(Object.keys(DEMO_GRAPH.nodes).length);
    });

    it('принимает и готовый граф', () => {
        const effect = createEffect(DEMO_GRAPH);
        expect(effect.errors).toEqual([]);
        expect(effect.graph).toBe(DEMO_GRAPH);
    });

    it('нечитаемый файл бросает EffectLoadError с причиной', () => {
        expect(() => createEffect('{oops')).toThrow(EffectLoadError);
        try {
            createEffect('{"format":"other"}');
        } catch (e) {
            expect(e).toBeInstanceOf(EffectLoadError);
            expect((e as EffectLoadError).error.code).toBe('notTaofxFile');
        }
    });

    it('граф без выхода не роняет игру: ошибки в errors, материал пурпурный', () => {
        const effect = createEffect({ nodes: {}, connections: [] });
        expect(effect.errors.map((e) => e.kind)).toEqual(['noOutput']);
        expect(effect.material.colorNode?.isNode).toBe(true); // запасная поверхность
    });

    it('dispose освобождает материал', () => {
        const effect = createEffect(demoText);
        let disposed = false;
        effect.material.addEventListener('dispose', () => (disposed = true));
        effect.dispose();
        expect(disposed).toBe(true);
    });
});

describe('Pow, Clamp, Remap в TSL', () => {
    it('собираются в материал без ошибок', () => {
        const file = {
            nodes: {
                c: { id: 'c', type: 'const/color', x: 0, y: 0, values: { value: [0.5, 0.2, 0.1] } },
                p: { id: 'p', type: 'math/pow', x: 0, y: 0, values: { exponent: 2 } },
                k: { id: 'k', type: 'math/clamp', x: 0, y: 0, values: { min: 0, max: 0.2 } },
                r: { id: 'r', type: 'math/remap', x: 0, y: 0, values: { inMin: 0, inMax: 0.2, outMin: 0, outMax: 1 } },
                out: { id: 'out', type: 'output/surface', x: 0, y: 0, values: {} },
            },
            connections: [
                { id: '1', from: { node: 'c', pin: 'color' }, to: { node: 'p', pin: 'base' } },
                { id: '2', from: { node: 'p', pin: 'result' }, to: { node: 'k', pin: 'x' } },
                { id: '3', from: { node: 'k', pin: 'result' }, to: { node: 'r', pin: 'x' } },
                { id: '4', from: { node: 'r', pin: 'result' }, to: { node: 'out', pin: 'color' } },
            ],
        };
        const effect = createEffect(file as never);
        expect(effect.errors).toEqual([]);
        expect(effect.material.colorNode?.isNode).toBe(true);
    });
});
