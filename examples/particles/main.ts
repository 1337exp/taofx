// Одна система частиц из файла редактора в трёх бэкендах. Время общее и задаётся ползунком: система детерминирована,
// поэтому в любой момент все три показывают одни и те же частицы (три и PIXI смотрят на них по-разному: три в перспективе, PIXI плоско).
import { createGlslParticles } from '@1337exp/taofx/three';
import { createParticles } from '@1337exp/taofx/tsl';
import { createPixiParticles } from '@1337exp/taofx/pixi';
import { Application } from 'pixi.js';
import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { Color, PerspectiveCamera as GpuCamera, Scene as GpuScene, WebGPURenderer } from 'three/webgpu';

const S = 360;
// ?file=sprites открывает пример со спрайт-листом (текстура в файле), по умолчанию фонтан
const name = new URLSearchParams(location.search).get('file') ?? 'fountain';
const text = await (await fetch(`./${name}.json`)).text();

const host = (id: string) => document.getElementById(id)!;

// three · TSL
const gpu = new WebGPURenderer({ antialias: true });
gpu.setSize(S, S);
host('tsl').appendChild(gpu.domElement);
await gpu.init();
const gpuScene = new GpuScene();
gpuScene.background = new Color(0x05080d);
const gpuCamera = new GpuCamera(40, 1, 0.1, 50);
gpuCamera.position.set(0, 1.4, 6);
gpuCamera.lookAt(0, 1.4, 0);
const tsl = createParticles(text);
gpuScene.add(tsl.object);

// three · GLSL
const gl = new WebGLRenderer({ antialias: true });
gl.setSize(S, S);
gl.setClearColor(0x05080d, 1);
host('glsl').appendChild(gl.domElement);
const glScene = new Scene();
const glCamera = new PerspectiveCamera(40, 1, 0.1, 50);
glCamera.position.copy(gpuCamera.position);
glCamera.lookAt(0, 1.4, 0);
const glsl = createGlslParticles(text);
glScene.add(glsl.object);

// PIXI
const app = new Application();
// ?pixi=webgpu: тот же файл частиц на PIXI с рендерером WebGPU (шейдер WGSL)
const pixiPreference = new URLSearchParams(location.search).get('pixi') === 'webgpu' ? 'webgpu' : 'webgl';
await app.init({ width: S, height: S, preference: pixiPreference, background: 0x05080d, antialias: true, autoStart: false });
host('pixi').appendChild(app.canvas);
const pixi = createPixiParticles(text, { scale: 90 });
pixi.object.position.set(S / 2, S - 40);
app.stage.addChild(pixi.object);

function show(t: number): void {
    tsl.setTime(t);
    glsl.setTime(t);
    pixi.setTime(t);
    gpu.render(gpuScene, gpuCamera);
    gl.render(glScene, glCamera);
    app.render();
    host('report').textContent = [
        `время ${t.toFixed(2)} с · seed ${tsl.file.system.seed} · живых частиц: ${tsl.stats.live}`,
        `ошибки сборки: TSL ${tsl.errors.length}, GLSL ${glsl.errors.length}, PIXI ${pixi.errors.length}, WGSL ${pixi.gpuErrors.length} (PIXI рендерер: ${app.renderer.name})`,
    ].join('\n');
    (host('report').dataset as DOMStringMap).count = String(tsl.stats.live);
}

// Картинки текстур догружаются сами: в статичной сцене перерисовываем кадр, когда они пришли (в игре кадры идут постоянно)
setTimeout(() => show(Number((host('time') as HTMLInputElement).value)), 500);

const slider = host('time') as HTMLInputElement;
const play = host('play') as HTMLInputElement;
slider.addEventListener('input', () => {
    host('timeValue').textContent = slider.value;
    show(Number(slider.value));
});

let last = performance.now();
function frame(now: number): void {
    if (play.checked) {
        const next = (Number(slider.value) + (now - last) / 1000) % 12;
        slider.value = String(next);
        host('timeValue').textContent = next.toFixed(2);
        show(next);
    }
    last = now;
    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
show(Number(slider.value));
