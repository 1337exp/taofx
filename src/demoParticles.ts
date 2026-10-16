import type { EditorDoc } from '@/editor/doc';

/** Стартовая система частиц: фонтан мягких светящихся пятен (то же, что examples/particles/fountain.json). */
export const DEMO_PARTICLES: EditorDoc = {
    system: {
        duration: 2,
        loop: true,
        seed: 11,
        maxParticles: 600,
        blend: 'add',
        emitter: { rate: 90, bursts: [{ time: 0, count: 25 }], shape: { type: 'cone', angle: 14, radius: 0.12 } },
        particle: {
            lifetime: [0.9, 1.6],
            speed: [2.6, 3.6],
            size: [0.18, 0.34],
            rotation: [0, 360],
            spin: [-120, 120],
            gravity: [0, -3.2, 0],
            drag: 0.15,
            sizeOverLife: [{ t: 0, v: 0.4 }, { t: 0.25, v: 1 }, { t: 1, v: 0.2 }],
            colorOverLife: [
                { t: 0, color: [1, 0.9, 0.5], alpha: 1 },
                { t: 0.4, color: [1, 0.35, 0.08], alpha: 0.9 },
                { t: 1, color: [0.25, 0.05, 0.4], alpha: 0 },
            ],
        },
    },
    graph: {
        nodes: {
            p: { id: 'p', type: 'input/particle', x: 0, y: 0, values: {} },
            r: { id: 'r', type: 'input/radial', x: 0, y: 140, values: {} },
            soft: { id: 'soft', type: 'math/smoothstep', x: 200, y: 140, values: { low: 0.15, high: 1 } },
            disc: { id: 'disc', type: 'math/mix', x: 400, y: 140, values: { a: 1, b: 0 } },
            alpha: { id: 'alpha', type: 'math/multiply', x: 600, y: 100, values: {} },
            out: { id: 'out', type: 'output/surface', x: 800, y: 60, values: {} },
        },
        connections: [
            { id: 'c1', from: { node: 'r', pin: 'r' }, to: { node: 'soft', pin: 'x' } },
            { id: 'c2', from: { node: 'soft', pin: 'result' }, to: { node: 'disc', pin: 't' } },
            { id: 'c3', from: { node: 'disc', pin: 'result' }, to: { node: 'alpha', pin: 'a' } },
            { id: 'c4', from: { node: 'p', pin: 'alpha' }, to: { node: 'alpha', pin: 'b' } },
            { id: 'c5', from: { node: 'p', pin: 'tint' }, to: { node: 'out', pin: 'color' } },
            { id: 'c6', from: { node: 'alpha', pin: 'result' }, to: { node: 'out', pin: 'opacity' } },
        ],
    },
};
