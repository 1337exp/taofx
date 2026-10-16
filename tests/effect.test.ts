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
