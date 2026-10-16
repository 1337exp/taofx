// Генерирует public/sprites.json: частицы с проигрыванием спрайт-листа 4x2 по возрасту (нода «Спрайт-лист»).
// Лист рисуется здесь же (круги растущего радиуса с мягким краем), чтобы пример не зависел от внешних картинок.
// Запуск: node make-sprites.mjs
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const COLS = 4;
const ROWS = 2;
const CELL = 64;
const W = COLS * CELL;
const H = ROWS * CELL;
const pixels = Buffer.alloc(W * H * 4);

const hsl = (h, s, l) => {
    const a = s * Math.min(l, 1 - l);
    const f = (n) => {
        const k = (n + h * 12) % 12;
        return l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    };
    return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
};

for (let frame = 0; frame < COLS * ROWS; frame++) {
    const col = frame % COLS;
    const row = Math.floor(frame / COLS); // кадры слева направо и сверху вниз: так их читает нода
    const radius = 8 + frame * 3;
    const [r, g, b] = hsl(((frame * 40) % 360) / 360, 0.9, 0.6);
    for (let y = 0; y < CELL; y++) {
        for (let x = 0; x < CELL; x++) {
            const d = Math.hypot(x - CELL / 2 + 0.5, y - CELL / 2 + 0.5);
            const a = Math.max(0, Math.min(1, (radius - d) / 3));
            const i = ((row * CELL + y) * W + col * CELL + x) * 4;
            pixels.set([r, g, b, Math.round(a * 255)], i);
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

const raw = Buffer.alloc((W * 4 + 1) * H);
for (let y = 0; y < H; y++) pixels.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4);
const header = Buffer.alloc(13);
header.writeUInt32BE(W, 0);
header.writeUInt32BE(H, 4);
header.set([8, 6, 0, 0, 0], 8); // 8 бит, RGBA
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);

const node = (id, type, x, y, values = {}, params) => ({ id, type, x, y, values, ...(params ? { params } : {}) });
const link = (id, from, fromPin, to, toPin) => ({ id, from: { node: from, pin: fromPin }, to: { node: to, pin: toPin } });

const file = {
    format: 'taofx-particles',
    version: 1,
    system: {
        duration: 2,
        loop: true,
        seed: 11,
        maxParticles: 300,
        blend: 'normal',
        emitter: { rate: 30, bursts: [], shape: { type: 'cone', angle: 14, radius: 0.12 } },
        particle: {
            lifetime: [1, 1.5],
            speed: [2.6, 3.6],
            size: [0.4, 0.6],
            rotation: [0, 0],
            spin: [0, 0],
            gravity: [0, -3.2, 0],
            drag: 0.15,
            sizeOverLife: 1,
            colorOverLife: [
                { t: 0, color: [1, 1, 1], alpha: 1 },
                { t: 1, color: [1, 1, 1], alpha: 1 },
            ],
        },
    },
    material: {
        nodes: {
            p: node('p', 'input/particle', 0, 0),
            f: node('f', 'uv/flipbook', 200, 0, { columns: COLS, rows: ROWS }),
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
        textures: { sheet: { src: `data:image/png;base64,${png.toString('base64')}` } },
    },
};

writeFileSync(new URL('./public/sprites.json', import.meta.url), JSON.stringify(file));
console.log(`public/sprites.json: ${png.length} байт PNG`);
