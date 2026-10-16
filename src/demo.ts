import type { Graph } from '@/graph/types';

/** Демо: бегущий шум по UV, сглаженный в маску, красит поверхность между двумя цветами, плюс свечение по контуру. */
export const DEMO_GRAPH: Graph = {
    nodes: {
        uv: { id: 'uv', type: 'input/uv', x: 0, y: 0, values: {} },
        time: { id: 'time', type: 'input/time', x: 0, y: 140, values: {} },
        scale: { id: 'scale', type: 'math/multiply', x: 200, y: 0, values: { b: 5 } },
        drift: { id: 'drift', type: 'math/multiply', x: 200, y: 140, values: { b: 0.4 } },
        coord: { id: 'coord', type: 'math/add', x: 400, y: 60, values: {} },
        noise: { id: 'noise', type: 'noise/perlin', x: 600, y: 60, values: {} },
        mask: { id: 'mask', type: 'math/smoothstep', x: 800, y: 60, values: { low: -0.2, high: 0.4 } },
        dark: { id: 'dark', type: 'const/color', x: 800, y: 220, values: { value: [0.05, 0.02, 0.25] } },
        hot: { id: 'hot', type: 'const/color', x: 800, y: 340, values: { value: [1.0, 0.45, 0.1] } },
        body: { id: 'body', type: 'math/mix', x: 1000, y: 120, values: {} },
        fresnel: { id: 'fresnel', type: 'input/fresnel', x: 1000, y: 340, values: { power: 3 } },
        rim: { id: 'rim', type: 'const/color', x: 1000, y: 460, values: { value: [0.3, 0.8, 1.0] } },
        glow: { id: 'glow', type: 'math/mix', x: 1200, y: 240, values: {} },
        out: { id: 'out', type: 'output/surface', x: 1400, y: 200, values: {} },
    },
    connections: [
        { id: 'c1', from: { node: 'uv', pin: 'uv' }, to: { node: 'scale', pin: 'a' } },
        { id: 'c2', from: { node: 'time', pin: 't' }, to: { node: 'drift', pin: 'a' } },
        { id: 'c3', from: { node: 'scale', pin: 'result' }, to: { node: 'coord', pin: 'a' } },
        { id: 'c4', from: { node: 'drift', pin: 'result' }, to: { node: 'coord', pin: 'b' } },
        { id: 'c5', from: { node: 'coord', pin: 'result' }, to: { node: 'noise', pin: 'p' } },
        { id: 'c6', from: { node: 'noise', pin: 'n' }, to: { node: 'mask', pin: 'x' } },
        { id: 'c7', from: { node: 'dark', pin: 'color' }, to: { node: 'body', pin: 'a' } },
        { id: 'c8', from: { node: 'hot', pin: 'color' }, to: { node: 'body', pin: 'b' } },
        { id: 'c9', from: { node: 'mask', pin: 'result' }, to: { node: 'body', pin: 't' } },
        { id: 'c10', from: { node: 'body', pin: 'result' }, to: { node: 'glow', pin: 'a' } },
        { id: 'c11', from: { node: 'rim', pin: 'color' }, to: { node: 'glow', pin: 'b' } },
        { id: 'c12', from: { node: 'fresnel', pin: 'f' }, to: { node: 'glow', pin: 't' } },
        { id: 'c13', from: { node: 'glow', pin: 'result' }, to: { node: 'out', pin: 'color' } },
    ],
};
