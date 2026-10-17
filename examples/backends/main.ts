// Один файл эффекта в четырёх бэкендах: three с TSL (WebGPURenderer), three с GLSL (WebGLRenderer), PIXI с GLSL-фильтром (WebGL)
// и PIXI с WGSL-фильтром (WebGPU).
// Кадры считаются в буферы, сравниваются числом и показываются на странице. Ожидание: TSL и GLSL совпадают до погрешности
// float, PIXI до 8 бит (он пишет в 8-битный sRGB).
import { compileGlsl, createDefaultRegistry, parseEffect, type Graph } from '@1337exp/taofx';
import { createPixiEffect } from '@1337exp/taofx/pixi';
import { createGlslEffect } from '@1337exp/taofx/three';
import { createEffect } from '@1337exp/taofx/tsl';
import { Application, Rectangle, Sprite, Texture } from 'pixi.js';
import { uv, vec3 } from 'three/tsl';
import { WebGLRenderer, WebGLRenderTarget } from 'three';
import { FloatType, Mesh, MeshBasicNodeMaterial, OrthographicCamera, PlaneGeometry, RenderTarget, Scene, WebGPURenderer } from 'three/webgpu';

const W = 256;
const registry = createDefaultRegistry();

//--------------------------------------------------
// Вспомогательное

/** Линейное 0…1 в sRGB-байт: как делает вывод на экран. */
function srgbByte(v: number): number {
    const c = Math.min(1, Math.max(0, v));
    const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    return Math.round(s * 255);
}

/** Буфер float-пикселей (линейных, RGBA) в sRGB-байты; `bottomUp`: строки идут снизу вверх (так отдаёт OpenGL). */
function toSrgbBytes(data: Float32Array, bottomUp: boolean): Uint8ClampedArray {
    const out = new Uint8ClampedArray(W * W * 4);
    for (let y = 0; y < W; y++) {
        const srcY = bottomUp ? W - 1 - y : y;
        for (let x = 0; x < W; x++) {
            const i = (srcY * W + x) * 4;
            const o = (y * W + x) * 4;
            out[o] = srgbByte(data[i]!);
            out[o + 1] = srgbByte(data[i + 1]!);
            out[o + 2] = srgbByte(data[i + 2]!);
            out[o + 3] = 255;
        }
    }
    return out;
}

interface Stats {
    max: number;
    mean: number;
    over2: number;
}

function diffStats(a: Uint8ClampedArray, b: Uint8ClampedArray): Stats {
    let max = 0;
    let sum = 0;
    let over2 = 0;
    for (let i = 0; i < a.length; i += 4) {
        let d = 0;
        for (let k = 0; k < 3; k++) d = Math.max(d, Math.abs(a[i + k]! - b[i + k]!));
        max = Math.max(max, d);
        sum += d;
        if (d > 2) over2++;
    }
    const n = a.length / 4;
    return { max, mean: sum / n, over2: (100 * over2) / n };
}

const fmt = (s: Stats) => `макс ${s.max}/255, среднее ${s.mean.toFixed(3)}, пикселей с разницей >2: ${s.over2.toFixed(2)}%`;

function diffImage(a: Uint8ClampedArray, b: Uint8ClampedArray): Uint8ClampedArray {
    const out = new Uint8ClampedArray(a.length);
    for (let i = 0; i < a.length; i += 4) {
        for (let k = 0; k < 3; k++) out[i + k] = Math.min(255, Math.abs(a[i + k]! - b[i + k]!) * 16);
        out[i + 3] = 255;
    }
    return out;
}

function show(row: HTMLElement, title: string, bytes: Uint8ClampedArray): void {
    const fig = document.createElement('figure');
    const canvas = document.createElement('canvas');
    canvas.className = 'out';
    canvas.width = canvas.height = W;
    canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(bytes), W, W), 0, 0);
    const cap = document.createElement('figcaption');
    cap.textContent = title;
    fig.append(canvas, cap);
    row.appendChild(fig);
}

const quad = () => new PlaneGeometry(2, 2);
const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

//--------------------------------------------------
// Рендереры живут всю страницу, эффекты создаются под каждый случай

const gpu = new WebGPURenderer({ antialias: false });
await gpu.init();
gpu.setClearColor(0x000000, 0);
const gpuTarget = new RenderTarget(W, W, { type: FloatType });
const gpuBackend = (gpu.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2 (откат)';

async function readGpu(scene: Scene): Promise<Float32Array> {
    gpu.setRenderTarget(gpuTarget);
    gpu.render(scene, camera);
    gpu.setRenderTarget(null);
    return (await gpu.readRenderTargetPixelsAsync(gpuTarget, 0, 0, W, W)) as Float32Array;
}

/** Калибровка: в каком порядке строк WebGPURenderer отдаёт буфер (картинка с uv.y в зелёном канале). */
async function gpuBottomUp(): Promise<boolean> {
    const probe = new MeshBasicNodeMaterial();
    probe.colorNode = vec3(0, uv().y, 0);
    const data = await readGpu(new Scene().add(new Mesh(quad(), probe)));
    return data[1]! < data[(W - 1) * W * 4 + 1]!; // первая строка темнее последней: uv.y растёт к концу буфера, значит снизу вверх
}

const gl = new WebGLRenderer({ antialias: false });
gl.setClearColor(0x000000, 0);
const glTarget = new WebGLRenderTarget(W, W, { type: FloatType });

function readGl(scene: Scene): Float32Array {
    gl.setRenderTarget(glTarget);
    gl.render(scene, camera);
    gl.setRenderTarget(null);
    const data = new Float32Array(W * W * 4);
    gl.readRenderTargetPixels(glTarget, 0, 0, W, W, data);
    return data;
}

const app = new Application();
await app.init({ width: W, height: W, preference: 'webgl', backgroundAlpha: 0, antialias: false, resolution: 1, autoDensity: false, autoStart: false });

// PIXI на WebGPU: тот же фильтр, но программа WGSL. Если WebGPU у PIXI не поднялся, сравнение с ним пропускается.
const appGpu = new Application();
let pixiGpuOk = true;
try {
    await appGpu.init({ width: W, height: W, preference: 'webgpu', backgroundAlpha: 0, antialias: false, resolution: 1, autoDensity: false, autoStart: false });
    pixiGpuOk = appGpu.renderer.name === 'webgpu';
} catch {
    pixiGpuOk = false;
}

function readPixi(target: Application, sprite: Sprite): Uint8ClampedArray {
    target.stage.removeChildren();
    target.stage.addChild(sprite);
    target.renderer.render(target.stage);
    const { pixels } = target.renderer.extract.pixels({ target: target.stage, frame: new Rectangle(0, 0, W, W) });
    return new Uint8ClampedArray(pixels);
}

const bottomUpGpu = await gpuBottomUp();

//--------------------------------------------------
// Случаи

interface Case {
    title: string;
    file: string;
    /** Идёт ли в сравнение PIXI (у него нет нормали, френель ему недоступен). */
    pixi: boolean;
}

const CASES: Case[] = [
    { title: 'effect.json (со Френелем, нужна нормаль): TSL против GLSL в three', file: './effect.json', pixi: false },
    { title: 'effect-2d.json (без Френеля): TSL, GLSL в three и фильтр PIXI', file: './effect-2d.json', pixi: true },
];

const texts = new Map<string, string>();
for (const c of CASES) texts.set(c.file, await (await fetch(c.file)).text());

interface CaseResult {
    title: string;
    tslVsGlsl: Stats;
    tslVsPixi?: Stats;
    tslVsPixiGpu?: Stats;
    errors: string;
}

async function runCase(c: Case, t: number, host: HTMLElement): Promise<CaseResult> {
    const text = texts.get(c.file)!;

    const tsl = createEffect(text);
    tsl.setTime(t);
    const tslBytes = toSrgbBytes(await readGpu(new Scene().add(new Mesh(quad(), tsl.material))), bottomUpGpu);

    const glsl = createGlslEffect(text);
    glsl.setTime(t);
    const glslBytes = toSrgbBytes(readGl(new Scene().add(new Mesh(quad(), glsl.material))), true);

    const row = document.createElement('div');
    row.className = 'row';
    const heading = document.createElement('h2');
    heading.textContent = c.title;
    host.append(heading, row);
    show(row, `three · TSL · ${gpuBackend}`, tslBytes);
    show(row, 'three · GLSL · WebGLRenderer', glslBytes);
    show(row, 'разница TSL и GLSL ×16', diffImage(tslBytes, glslBytes));

    const result: CaseResult = { title: c.title, tslVsGlsl: diffStats(tslBytes, glslBytes), errors: `TSL ${tsl.errors.length}, GLSL ${glsl.errors.length}` };

    if (c.pixi) {
        const pixi = createPixiEffect(text);
        pixi.setTime(t);
        const sprite = new Sprite(Texture.WHITE);
        sprite.width = sprite.height = W;
        sprite.filters = [pixi.filter];
        const pixiBytes = readPixi(app, sprite);
        show(row, 'PIXI · GLSL-фильтр · WebGL', pixiBytes);
        show(row, 'разница TSL и PIXI ×16', diffImage(tslBytes, pixiBytes));
        result.tslVsPixi = diffStats(tslBytes, pixiBytes);
        result.errors += `, PIXI ${pixi.errors.length}, WGSL ${pixi.gpuErrors.length}`;

        if (pixiGpuOk) {
            const spriteGpu = new Sprite(Texture.WHITE);
            spriteGpu.width = spriteGpu.height = W;
            spriteGpu.filters = [pixi.filter];
            const gpuBytes = readPixi(appGpu, spriteGpu);
            show(row, 'PIXI · WGSL-фильтр · WebGPU', gpuBytes);
            show(row, 'разница TSL и PIXI WebGPU ×16', diffImage(tslBytes, gpuBytes));
            result.tslVsPixiGpu = diffStats(tslBytes, gpuBytes);
        }
        pixi.dispose();
    }

    tsl.dispose();
    glsl.dispose();
    return result;
}

/** Какие цели принимает граф: показывает, как компилятор объясняет, чего не хватает. */
function capabilityNotes(): string[] {
    const lines: string[] = [];
    for (const c of CASES) {
        const graph = (parseEffect(texts.get(c.file)!, registry) as { ok: true; graph: Graph }).graph;
        for (const target of ['three', 'pixi'] as const) {
            const r = compileGlsl(graph, registry, target);
            lines.push(`${c.file} → GLSL «${target}»: ${r.errors.length ? r.errors.map((e) => e.message).join('; ') : 'собирается'}`);
        }
    }
    return lines;
}

async function run(t: number): Promise<void> {
    const host = document.getElementById('images')!;
    host.replaceChildren();
    const results: CaseResult[] = [];
    for (const c of CASES) results.push(await runCase(c, t, host));

    const report = [
        `время эффекта: ${t.toFixed(2)} с, кадр ${W}x${W}, бэкенд three: ${gpuBackend}, PIXI WebGPU: ${pixiGpuOk ? 'есть' : 'нет'}`,
        ...results.flatMap((r) => [
            '',
            r.title,
            `  TSL против GLSL: ${fmt(r.tslVsGlsl)}`,
            ...(r.tslVsPixi ? [`  TSL против PIXI (WebGL): ${fmt(r.tslVsPixi)}`] : []),
            ...(r.tslVsPixiGpu ? [`  TSL против PIXI (WebGPU, WGSL): ${fmt(r.tslVsPixiGpu)}`] : []),
            `  ошибки сборки: ${r.errors}`,
        ]),
        '',
        ...capabilityNotes(),
    ].join('\n');
    const el = document.getElementById('report')!;
    el.textContent = report;
    el.dataset.result = JSON.stringify({ backend: gpuBackend, bottomUpGpu, pixiGpuOk, results });
}

const slider = document.getElementById('time') as HTMLInputElement;
const label = document.getElementById('timeValue')!;
slider.addEventListener('input', () => {
    label.textContent = slider.value;
    void run(Number(slider.value));
});
await run(Number(slider.value));

//--------------------------------------------------
// Грубый замер: кадр 1024x1024 с эффектом без Френеля, N кадров подряд и синхронизация с GPU в конце.
// Это не профайлер: показывает порядок величин и сравнивает бэкенды на одной и той же работе.

async function bench(): Promise<string> {
    const B = 1024;
    const N = 120;
    const text = texts.get('./effect-2d.json')!;
    const lines: string[] = [`кадр ${B}x${B}, ${N} кадров, effect-2d.json`];

    const tsl = createEffect(text);
    const tslScene = new Scene().add(new Mesh(quad(), tsl.material));
    const tslRt = new RenderTarget(B, B, { type: FloatType });
    gpu.setRenderTarget(tslRt);
    gpu.render(tslScene, camera); // прогрев: компиляция шейдера не в замере
    await gpu.readRenderTargetPixelsAsync(tslRt, 0, 0, 1, 1);
    let t0 = performance.now();
    for (let i = 0; i < N; i++) {
        tsl.setTime(i / 60);
        gpu.render(tslScene, camera);
    }
    await gpu.readRenderTargetPixelsAsync(tslRt, 0, 0, 1, 1);
    lines.push(`three · TSL (${gpuBackend}): ${((performance.now() - t0) / N).toFixed(2)} мс/кадр`);
    gpu.setRenderTarget(null);
    tsl.dispose();

    const glsl = createGlslEffect(text);
    const glScene = new Scene().add(new Mesh(quad(), glsl.material));
    const glRt = new WebGLRenderTarget(B, B, { type: FloatType });
    const px = new Float32Array(4);
    gl.setRenderTarget(glRt);
    gl.render(glScene, camera);
    gl.readRenderTargetPixels(glRt, 0, 0, 1, 1, px);
    t0 = performance.now();
    for (let i = 0; i < N; i++) {
        glsl.setTime(i / 60);
        gl.render(glScene, camera);
    }
    gl.readRenderTargetPixels(glRt, 0, 0, 1, 1, px);
    lines.push(`three · GLSL (WebGLRenderer): ${((performance.now() - t0) / N).toFixed(2)} мс/кадр`);
    gl.setRenderTarget(null);
    glsl.dispose();

    const pixi = createPixiEffect(text);
    app.renderer.resize(B, B);
    const sprite = new Sprite(Texture.WHITE);
    sprite.width = sprite.height = B;
    sprite.filters = [pixi.filter];
    app.stage.removeChildren();
    app.stage.addChild(sprite);
    const rect = new Rectangle(0, 0, 1, 1);
    app.renderer.render(app.stage);
    app.renderer.extract.pixels({ target: app.stage, frame: rect });
    t0 = performance.now();
    for (let i = 0; i < N; i++) {
        pixi.setTime(i / 60);
        app.renderer.render(app.stage);
    }
    app.renderer.extract.pixels({ target: app.stage, frame: rect });
    lines.push(`PIXI · GLSL-фильтр (WebGL): ${((performance.now() - t0) / N).toFixed(2)} мс/кадр`);
    pixi.dispose();
    app.renderer.resize(W, W);
    return lines.join('\n');
}

document.getElementById('bench')!.addEventListener('click', async () => {
    const note = document.getElementById('benchNote')!;
    note.textContent = 'считаю…';
    const text = await bench();
    await run(Number(slider.value)); // замер менял размер холстов: возвращаем страницу в обычный вид
    note.textContent = '';
    document.getElementById('report')!.textContent += `\n\n${text}`;
});
