// Генерирует примеры частиц с новыми возможностями (вытянутые искры с отскоком, лента-шлейф с силами) рядом с fountain.json.
// Запуск: node make-showcase.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('./public/', import.meta.url);
const fountain = JSON.parse(readFileSync(new URL('fountain.json', dir), 'utf8'));

const node = (id, type, x, y, values = {}) => [id, { id, type, x, y, values }];
const link = (id, from, fromPin, to, toPin) => ({ id, from: { node: from, pin: fromPin }, to: { node: to, pin: toPin } });

// Искры: вытянутые вдоль скорости квадраты, отскакивают от пола
const sparks = {
    format: 'taofx-particles',
    version: 1,
    system: {
        duration: 1.5,
        loop: true,
        seed: 4,
        maxParticles: 400,
        blend: 'add',
        render: { mode: 'stretch', stretch: 0.22, sort: false },
        emitter: { rate: 0, bursts: [{ time: 0, count: 70 }, { time: 0.75, count: 70 }], shape: { type: 'cone', angle: 55, radius: 0.05 } },
        particle: {
            lifetime: [0.9, 1.5],
            speed: [3, 6.5],
            size: [0.06, 0.11],
            gravity: [0, -9, 0],
            drag: 0.25,
            colliders: [{ type: 'plane', normal: [0, 1, 0], offset: 0, bounce: 0.45, friction: 0.25, kill: false }],
            sizeOverLife: [{ t: 0, v: 1 }, { t: 1, v: 0.25 }],
            colorOverLife: [
                { t: 0, color: [1, 0.95, 0.7], alpha: 1 },
                { t: 0.5, color: [1, 0.5, 0.1], alpha: 0.9 },
                { t: 1, color: [0.6, 0.1, 0.05], alpha: 0 },
            ],
        },
    },
    material: fountain.material,
};

// Лента: цвет частицы, прозрачность = жизнь · затухание к хвосту (uv.x: 1 у головы, 0 у конца) · мягкий край поперёк (uv.y)
const ribbonMaterial = {
    nodes: Object.fromEntries([
        node('p', 'input/particle', 0, 0),
        node('uv', 'input/uv', 0, 160),
        node('across', 'math/multiply', 200, 220, { b: Math.PI }),
        node('edge', 'math/sin', 400, 220),
        node('along', 'math/pow', 200, 120, { exponent: 1.2 }),
        node('m1', 'math/multiply', 600, 160),
        node('m2', 'math/multiply', 800, 120),
        node('out', 'output/surface', 1000, 60),
    ]),
    connections: [
        link('c1', 'uv', 'v', 'across', 'a'),
        link('c2', 'across', 'result', 'edge', 'x'),
        link('c3', 'uv', 'u', 'along', 'base'),
        link('c4', 'edge', 'result', 'm1', 'a'),
        link('c5', 'along', 'result', 'm1', 'b'),
        link('c6', 'm1', 'result', 'm2', 'a'),
        link('c7', 'p', 'alpha', 'm2', 'b'),
        link('c8', 'p', 'tint', 'out', 'color'),
        link('c9', 'm2', 'result', 'out', 'opacity'),
    ],
};

const trail = {
    format: 'taofx-particles',
    version: 1,
    system: {
        duration: 3,
        loop: true,
        seed: 21,
        maxParticles: 60,
        blend: 'add',
        render: { mode: 'ribbon', sort: false, trail: { length: 0.9, segments: 20, widthOverLength: [{ t: 0, v: 1 }, { t: 1, v: 0 }] } },
        emitter: { rate: 14, bursts: [], shape: { type: 'circle', radius: 0.6 } },
        particle: {
            lifetime: [2.2, 3],
            speed: [0.6, 1.2],
            size: [0.07, 0.12],
            gravity: [0, 0.4, 0],
            drag: 0.2,
            forces: [
                { type: 'vortex', position: [0, 0, 0], axis: [0, 1, 0], strength: 3.2, radius: 3 },
                { type: 'turbulence', strength: 2.5, scale: 0.9, speed: 0.4 },
                { type: 'attractor', position: [0, 1.6, 0], strength: 5, radius: 5 },
            ],
            colorOverLife: [
                { t: 0, color: [0.3, 0.8, 1], alpha: 0 },
                { t: 0.15, color: [0.5, 0.9, 1], alpha: 1 },
                { t: 0.7, color: [0.8, 0.4, 1], alpha: 0.8 },
                { t: 1, color: [1, 0.3, 0.6], alpha: 0 },
            ],
        },
    },
    material: ribbonMaterial,
};


// Круглое мягкое пятно (как в fountain): 1 в центре, спад к краю
const disc = [
    node('r', 'input/radial', 0, 140),
    node('soft', 'math/smoothstep', 200, 140, { low: 0.1, high: 1 }),
    node('disc', 'math/mix', 400, 140, { a: 1, b: 0 }),
];
const discLinks = [link('d1', 'r', 'r', 'soft', 'x'), link('d2', 'soft', 'result', 'disc', 't')];

// Дым: мягкие частицы. Непрозрачность умножается на затухание у геометрии, поэтому пятна не режутся о пол и предметы жёстким краем.
const smoke = {
    format: 'taofx-particles',
    version: 1,
    system: {
        duration: 4,
        loop: true,
        seed: 8,
        maxParticles: 120,
        blend: 'normal',
        render: { mode: 'billboard', sort: true },
        emitter: { rate: 16, bursts: [], shape: { type: 'circle', radius: 0.6 } },
        particle: {
            lifetime: [2.5, 3.5],
            speed: [0.3, 0.6],
            size: [0.9, 1.4],
            rotation: [0, 360],
            spin: [-20, 20],
            gravity: [0, 0.35, 0],
            drag: 0.4,
            forces: [{ type: 'turbulence', strength: 1.2, scale: 0.7, speed: 0.3 }],
            sizeOverLife: [{ t: 0, v: 0.5 }, { t: 1, v: 1.5 }],
            colorOverLife: [
                { t: 0, color: [0.75, 0.78, 0.85], alpha: 0 },
                { t: 0.2, color: [0.7, 0.72, 0.8], alpha: 0.55 },
                { t: 1, color: [0.45, 0.47, 0.55], alpha: 0 },
            ],
        },
    },
    material: {
        nodes: Object.fromEntries([
            node('p', 'input/particle', 0, 0),
            ...disc,
            node('fade', 'scene/depth-fade', 400, 300, { distance: 0.7 }),
            node('a1', 'math/multiply', 600, 120),
            node('a2', 'math/multiply', 800, 160),
            node('out', 'output/surface', 1000, 80),
        ]),
        connections: [
            ...discLinks,
            link('s1', 'disc', 'result', 'a1', 'a'),
            link('s2', 'p', 'alpha', 'a1', 'b'),
            link('s3', 'a1', 'result', 'a2', 'a'),
            link('s4', 'fade', 'fade', 'a2', 'b'),
            link('s5', 'p', 'tint', 'out', 'color'),
            link('s6', 'a2', 'result', 'out', 'opacity'),
        ],
    },
};

// Марево: частицы показывают сцену позади, сдвинутую шумом. Видно только на фоне (включите «Окружение» в редакторе).
const haze = {
    format: 'taofx-particles',
    version: 1,
    system: {
        duration: 3,
        loop: true,
        seed: 5,
        maxParticles: 40,
        blend: 'normal',
        render: { mode: 'billboard', sort: true },
        emitter: { rate: 8, bursts: [], shape: { type: 'circle', radius: 0.5 } },
        particle: {
            lifetime: [2, 3],
            speed: [0.4, 0.8],
            size: [1.2, 1.8],
            gravity: [0, 0.6, 0],
            drag: 0.3,
            sizeOverLife: [{ t: 0, v: 0.6 }, { t: 1, v: 1.2 }],
            colorOverLife: [
                { t: 0, color: [1, 1, 1], alpha: 0 },
                { t: 0.25, color: [1, 1, 1], alpha: 1 },
                { t: 1, color: [1, 1, 1], alpha: 0 },
            ],
        },
    },
    material: {
        nodes: Object.fromEntries([
            node('p', 'input/particle', 0, 0),
            ...disc,
            node('uv', 'input/uv', 0, 340),
            node('t', 'input/time', 0, 440),
            node('scaleUv', 'math/multiply', 200, 340, { b: 4 }),
            node('slow', 'math/multiply', 200, 440, { b: 0.7 }),
            node('moving', 'math/add', 400, 380),
            node('noise', 'noise/perlin', 600, 380),
            node('strength', 'math/multiply', 800, 380, { b: 0.04 }),
            node('behind', 'scene/scene-color', 1000, 380),
            node('a1', 'math/multiply', 600, 120),
            node('out', 'output/surface', 1200, 80),
        ]),
        connections: [
            ...discLinks,
            link('h1', 'uv', 'uv', 'scaleUv', 'a'),
            link('h2', 't', 't', 'slow', 'a'),
            link('h3', 'scaleUv', 'result', 'moving', 'a'),
            link('h4', 'slow', 'result', 'moving', 'b'),
            link('h5', 'moving', 'result', 'noise', 'p'),
            link('h6', 'noise', 'n', 'strength', 'a'),
            link('h7', 'strength', 'result', 'behind', 'offset'),
            link('h8', 'disc', 'result', 'a1', 'a'),
            link('h9', 'p', 'alpha', 'a1', 'b'),
            link('h10', 'behind', 'color', 'out', 'color'),
            link('h11', 'a1', 'result', 'out', 'opacity'),
        ],
    },
};

for (const [name, file] of Object.entries({ sparks, trail, smoke, haze })) writeFileSync(new URL(`${name}.json`, dir), JSON.stringify(file, null, 2) + '\n');
