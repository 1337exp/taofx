// Обычная three.js-сцена: свет, пол, обычные материалы. Эффект из редактора taofx это просто материал для меша.
import { createEffect } from '@1337exp/taofx/tsl';
import {
    AmbientLight,
    Color,
    DirectionalLight,
    Mesh,
    MeshStandardMaterial,
    PerspectiveCamera,
    PlaneGeometry,
    Scene,
    SphereGeometry,
    TorusKnotGeometry,
    WebGPURenderer,
} from 'three/webgpu';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const info = document.getElementById('info')!;

const renderer = new WebGPURenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
await renderer.init();

const scene = new Scene();
scene.background = new Color(0x0b0d12);
scene.add(new AmbientLight(0x8899bb, 0.8));
const sun = new DirectionalLight(0xffffff, 2);
sun.position.set(3, 5, 2);
scene.add(sun);

const camera = new PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 1.6, 5);
camera.lookAt(0, 0.8, 0);

const floor = new Mesh(new PlaneGeometry(10, 10), new MeshStandardMaterial({ color: 0x20242c, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

const knot = new Mesh(new TorusKnotGeometry(0.5, 0.18, 120, 16), new MeshStandardMaterial({ color: 0x8aa0c8, roughness: 0.4, metalness: 0.3 }));
knot.position.set(-1.6, 1, 0);
scene.add(knot);

// Эффект: загрузили файл редактора и повесили материал на меш.
const effect = createEffect(await (await fetch('./effect.json')).text());

const orb = new Mesh(new SphereGeometry(0.9, 64, 48), effect.material);
orb.position.set(0.8, 1, 0);
scene.add(orb);

// Тот же материал годится и на второй меш: эффект не привязан к форме.
const orb2 = new Mesh(new SphereGeometry(0.35, 48, 32), effect.material);
orb2.position.set(2.4, 0.4, 0.6);
scene.add(orb2);

info.textContent = effect.errors.length ? `Ошибки эффекта: ${effect.errors.map((e) => e.message).join('; ')}` : 'Эффект из taofx подключён без редактора';
info.classList.toggle('error', effect.errors.length > 0);

function resize() {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

renderer.setAnimationLoop((now) => {
    effect.setTime(now / 1000);
    knot.rotation.y += 0.01;
    orb.rotation.y += 0.004;
    renderer.render(scene, camera);
});
