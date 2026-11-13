// Готовит ресурсы примера в public/: лист взрыва с прозрачным фоном и файл частиц.
//   public/explosion-sheet.png  из images.jpg: кадры вырезаны, фон стал альфой, кадры лежат в равных квадратных ячейках
//   public/explosion.json       файл частиц (формат taofx-particles): его же открывает редактор taofx
// Запуск: npm run make
import { deflateSync } from 'node:zlib';
import { readFileSync, writeFileSync } from 'node:fs';
import jpeg from 'jpeg-js';

const pub = new URL('./public/', import.meta.url);

//--------------------------------------------------
// 1. Лист. images.jpg это JPEG: альфы нет, фон плоский (63, 51, 63), кадры разной ширины (взрыв растёт), стоят в ряд.
// Модуль flipbook делит картинку на равные ячейки, поэтому кадры переносятся в сетку 6x1 ячеек CELLxCELL.
// Кадры не масштабируются: так видно, как взрыв растёт, а поле вокруг нужно, чтобы линейная фильтрация не цепляла соседа.

const BG = [63, 51, 63];
const CUTS = [0, 101, 216, 373, 534, 716, 894]; // x границ кадров на images.jpg (между кадрами пустые столбцы)
const CELL = 192;
const FRAMES = CUTS.length - 1;

const src = jpeg.decode(readFileSync(new URL('images.jpg', pub)), { useTArray: true });
const smooth = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
};
// расстояние цвета до фона -> непрозрачность; цвет очищается от примеси фона (p = a·c + (1−a)·bg)
const key = (x, y) => {
    const i = (y * src.width + x) * 4;
    const rgb = [src.data[i], src.data[i + 1], src.data[i + 2]];
    const dist = Math.hypot(rgb[0] - BG[0], rgb[1] - BG[1], rgb[2] - BG[2]);
    const a = smooth(6, 34, dist);
    const color = a > 0 ? rgb.map((v, k) => Math.min(255, Math.max(0, BG[k] + (v - BG[k]) / a))) : [0, 0, 0];
    return { dist, a, color };
};

const W = CELL * FRAMES;
const sheet = Buffer.alloc(W * CELL * 4);
for (let f = 0; f < FRAMES; f++) {
    const [x0, x1] = [CUTS[f], CUTS[f + 1]];
    // ограничивающий прямоугольник взрыва в кадре (случайные искорки с краю в расчёт не берём)
    let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1;
    for (let y = 0; y < src.height; y++) for (let x = x0; x < x1; x++) if (key(x, y).dist > 30) [minX, maxX, minY, maxY] = [Math.min(minX, x), Math.max(maxX, x), Math.min(minY, y), Math.max(maxY, y)];
    const dx = Math.round(f * CELL + CELL / 2 - (minX + maxX) / 2); // сдвиг: центр прямоугольника в центр ячейки
    const dy = Math.round(CELL / 2 - (minY + maxY) / 2);
    for (let y = 0; y < src.height; y++) {
        for (let x = x0; x < x1; x++) {
            const [tx, ty] = [x + dx, y + dy];
            if (tx < f * CELL || tx >= (f + 1) * CELL || ty < 0 || ty >= CELL) continue;
            const { a, color } = key(x, y);
            sheet.set([color[0], color[1], color[2], Math.round(a * 255)], (ty * W + tx) * 4);
        }
    }
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
});
const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
    const body = Buffer.concat([Buffer.from(type), data]);
    const out = Buffer.alloc(body.length + 8);
    out.writeUInt32BE(data.length, 0);
    body.copy(out, 4);
    out.writeUInt32BE(crc(body), body.length + 4);
    return out;
};
const raw = Buffer.alloc((W * 4 + 1) * CELL);
for (let y = 0; y < CELL; y++) sheet.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
const header = Buffer.alloc(13);
header.writeUInt32BE(W, 0);
header.writeUInt32BE(CELL, 4);
header.set([8, 6, 0, 0, 0], 8); // 8 бит, RGBA
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
writeFileSync(new URL('explosion-sheet.png', pub), png);

//--------------------------------------------------
// 2. Файл частиц. Всплеск из нескольких «клубов» с разбросом по времени: каждый клуб проигрывает все кадры листа за свою
// жизнь (нода «Спрайт-лист», фаза = возраст частицы) и чуть растёт, разлетаясь с торможением. Единица системы = 100 px
// (так просит main.ts), ячейка листа 192 px = 1,92 единицы.

const node = (id, type, x, y, values = {}, params) => ({ id, type, x, y, values, ...(params ? { params } : {}) });
const link = (id, from, fromPin, to, toPin) => ({ id, from: { node: from, pin: fromPin }, to: { node: to, pin: toPin } });

const file = {
    format: 'taofx-particles',
    version: 1,
    system: {
        duration: 0.6,
        loop: false,
        seed: 7,
        maxParticles: 64,
        blend: 'normal',
        emitter: {
            rate: 0,
            bursts: [
                { time: 0, count: 3 },
                { time: 0.08, count: 4 },
                { time: 0.16, count: 4 },
                { time: 0.26, count: 3 },
            ],
            shape: { type: 'point' },
        },
        particle: {
            lifetime: [0.7, 1.1],
            speed: [0.5, 2.4],
            size: [1.7, 3.6],
            rotation: [-20, 20],
            spin: [-12, 12],
            gravity: [0, 0.8, 0],
            drag: 2.2,
            sizeOverLife: [
                { t: 0, v: 0.85 },
                { t: 1, v: 1.2 },
            ],
            colorOverLife: [
                { t: 0, color: [1, 1, 1], alpha: 1 },
                { t: 0.8, color: [1, 1, 1], alpha: 1 },
                { t: 1, color: [1, 1, 1], alpha: 0 },
            ],
        },
    },
    material: {
        nodes: {
            p: node('p', 'input/particle', 0, 0),
            f: node('f', 'uv/flipbook', 200, 0, { columns: FRAMES, rows: 1 }),
            t: node('t', 'input/texture', 420, 0, {}, { texture: 'sheet' }),
            m: node('m', 'math/multiply', 640, 0),
            out: node('out', 'output/surface', 860, 0),
        },
        connections: [
            link('1', 'p', 'age', 'f', 'phase'),
            link('2', 'f', 'uv', 't', 'uv'),
            link('3', 't', 'color', 'out', 'color'),
            link('4', 't', 'alpha', 'm', 'a'),
            link('5', 'p', 'alpha', 'm', 'b'),
            link('6', 'm', 'result', 'out', 'opacity'),
        ],
        textures: { sheet: { src: 'explosion-sheet.png' } },
    },
};
writeFileSync(new URL('explosion.json', pub), JSON.stringify(file, null, 2) + '\n');
console.log(`explosion-sheet.png ${W}x${CELL}, explosion.json`);
