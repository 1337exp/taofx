import { MAX_ZOOM, MIN_ZOOM } from '@1337exp/taoux/camera';
import { describe, expect, it } from 'vitest';
import { fitCamera } from '@/editor/state/view';

describe('fitCamera', () => {
    it('пустой граф даёт камеру по умолчанию', () => {
        expect(fitCamera([], { w: 800, h: 600 })).toMatchObject({ x: 0, y: 0, z: 1 });
    });

    it('все ноды помещаются в область, по центру, масштаб в допустимых пределах', () => {
        const nodes = [{ x: 0, y: 0 }, { x: 1000, y: 400 }];
        const cam = fitCamera(nodes, { w: 800, h: 600 });
        expect(cam.z).toBeGreaterThanOrEqual(MIN_ZOOM);
        expect(cam.z).toBeLessThanOrEqual(MAX_ZOOM);
        // левый край первой ноды и правый край последней (по оценке 210 px) лежат внутри области
        expect(0 * cam.z + cam.x).toBeGreaterThanOrEqual(0);
        expect((1000 + 210) * cam.z + cam.x).toBeLessThanOrEqual(800);
        expect(cam.z).toBeLessThan(1);
    });

    it('одна маленькая нода не раздувается выше предела масштаба', () => {
        expect(fitCamera([{ x: 5, y: 5 }], { w: 4000, h: 3000 }).z).toBe(MAX_ZOOM);
    });
});
