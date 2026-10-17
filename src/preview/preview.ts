import { BoxGeometry, BufferGeometry, Color, DirectionalLight, Group, HemisphereLight, type Object3D, Mesh, MeshBasicNodeMaterial, MeshStandardNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry, Vector2, Vector3, WebGPURenderer } from 'three/webgpu';
import type { FillView } from '@/particles/budget';
import type { CompiledSurface } from '@/tsl/compile';
import { createSurfaceMaterial } from '@/tsl/material';
import { createHeatMap, type HeatMap } from './overdraw';

export type Shape = 'sphere' | 'plane';

export interface Preview {
    /** Какой API реально работает: 'WebGPU' или 'WebGL2' (фолбэк). */
    readonly backend: string;
    setSurface(surface: CompiledSurface): void;
    setShape(shape: Shape): void;
    /** Показывает систему частиц вместо сферы (null: назад к сфере). */
    setParticles(object: Object3D | null): void;
    /** Пол и пара предметов в сцене: на них видно, как частицы режутся о геометрию (мягкие частицы) и что показывает рефракция. */
    setEnvironment(on: boolean): void;
    /** Тепловая карта перекрытий частиц (частицы должны быть в режиме `setDebug('overdraw')`). */
    setOverdraw(on: boolean): void;
    /** Камера и размер холста для оценки заполнения (`estimateFill`). */
    getFillView(): FillView;
    /** Вызывается каждый кадр вместо стандартной анимации; получает секунды с запуска предпросмотра. */
    setFrameHook(hook: ((seconds: number) => void) | null): void;
    dispose(): void;
}

/**
 * Окно предпросмотра: three.js WebGPURenderer (сам откатывается на WebGL2) и один меш с материалом из графа.
 * Редактор и игра используют один и тот же путь «граф → TSL → материал», поэтому вид совпадает.
 */
export async function createPreview(canvas: HTMLCanvasElement): Promise<Preview> {
    const renderer = new WebGPURenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    await renderer.init();

    const scene = new Scene();
    scene.background = new Color(0x0b0d12);

    const camera = new PerspectiveCamera(40, 1, 0.1, 100);
    camera.position.set(0, 0, 4);

    const geometries: Record<Shape, BufferGeometry> = { sphere: new SphereGeometry(1.2, 64, 48), plane: new PlaneGeometry(2.6, 2.6) };
    let material = new MeshBasicNodeMaterial();
    const mesh = new Mesh(geometries.sphere, material);
    scene.add(mesh);

    // Окружение для эффектов, которым нужна сцена позади: пол, куб и шар, пересекающие струю
    const environment = new Group();
    environment.visible = false;
    const floor = new Mesh(new PlaneGeometry(16, 16), new MeshStandardNodeMaterial({ color: 0x232733, roughness: 0.95 }));
    floor.rotation.x = -Math.PI / 2;
    const box = new Mesh(new BoxGeometry(1.1, 1.1, 1.1), new MeshStandardNodeMaterial({ color: 0x4a5372, roughness: 0.6 }));
    box.position.set(-0.9, 0.55, 0.1);
    box.rotation.y = 0.5;
    const ball = new Mesh(new SphereGeometry(0.7, 48, 32), new MeshStandardNodeMaterial({ color: 0x7a5d4a, roughness: 0.5 }));
    ball.position.set(0.85, 0.7, -0.1);
    const sun = new DirectionalLight(0xffffff, 2.2);
    sun.position.set(3, 5, 4);
    environment.add(floor, box, ball, sun, new HemisphereLight(0x8899bb, 0x222228, 1));
    scene.add(environment);

    const resize = () => {
        const w = canvas.clientWidth || 1;
        const h = canvas.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();

    // Время эффекта идёт от старта предпросмотра: uniform обновляем сами, часы three.js здесь не нужны.
    let time: { value: number } | null = null;
    const start = performance.now();

    let hook: ((seconds: number) => void) | null = null;
    let particles: Object3D | null = null;

    let overdraw = false;
    let heat: HeatMap | null = null;
    const heatSize = () => renderer.getDrawingBufferSize(new Vector2());

    /** Кадр с тепловой картой: частицы считают слои в отдельную цель, обычная сцена рисуется без них, поверх раскраска. */
    function renderOverdraw() {
        const size = heatSize();
        if (!heat) heat = createHeatMap(size.x, size.y);
        else if (heat.target.width !== size.x || heat.target.height !== size.y) heat.setSize(size.x, size.y);

        const background = scene.background;
        const clearColor = renderer.getClearColor(new Color());
        const clearAlpha = renderer.getClearAlpha();
        const wasEnvironment = environment.visible;
        const wasMesh = mesh.visible;
        scene.background = null;
        environment.visible = false;
        mesh.visible = false;
        renderer.setRenderTarget(heat.target);
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(scene, camera);
        renderer.setRenderTarget(null);
        renderer.setClearColor(clearColor, clearAlpha);
        scene.background = background;
        environment.visible = wasEnvironment;
        mesh.visible = wasMesh;

        if (particles) particles.visible = false;
        renderer.render(scene, camera);
        if (particles) particles.visible = true;

        renderer.autoClear = false;
        renderer.render(heat.overlay, heat.camera);
        renderer.autoClear = true;
    }

    renderer.setAnimationLoop(() => {
        const seconds = (performance.now() - start) / 1000;
        if (hook) {
            hook(seconds);
        } else {
            if (time) time.value = seconds;
            mesh.rotation.y += 0.004;
        }
        if (overdraw) renderOverdraw();
        else renderer.render(scene, camera);
    });

    return {
        backend: (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'WebGPU' : 'WebGL2',
        setSurface(surface) {
            const next = createSurfaceMaterial(surface);
            time = surface.time;
            mesh.material = next;
            material.dispose();
            material = next;
        },
        setParticles(object) {
            if (particles) scene.remove(particles);
            particles = object;
            if (object) scene.add(object);
            mesh.visible = !object;
            // фонтан бьёт вверх: камера смотрит чуть выше центра
            camera.position.set(0, object ? 1.3 : 0, object ? 6 : 4);
            camera.lookAt(0, object ? 1.3 : 0, 0);
        },
        setEnvironment(on) {
            environment.visible = on;
        },
        setOverdraw(on) {
            overdraw = on;
        },
        getFillView() {
            const width = canvas.clientWidth || 1;
            const height = canvas.clientHeight || 1;
            const forward = camera.getWorldDirection(new Vector3());
            return {
                position: [camera.position.x, camera.position.y, camera.position.z],
                forward: [forward.x, forward.y, forward.z],
                width,
                height,
                pixelsPerUnit: height / (2 * Math.tan((camera.fov * Math.PI) / 360)),
            };
        },
        setFrameHook(next) {
            hook = next;
        },
        setShape(shape) {
            mesh.geometry = geometries[shape];
        },
        dispose() {
            observer.disconnect();
            renderer.setAnimationLoop(null);
            material.dispose();
            Object.values(geometries).forEach((g) => g.dispose());
            environment.traverse((o) => {
                const m = o as Mesh;
                if (m.isMesh) {
                    m.geometry.dispose();
                    (m.material as MeshStandardNodeMaterial).dispose();
                }
            });
            heat?.dispose();
            renderer.dispose();
        },
    };
}
