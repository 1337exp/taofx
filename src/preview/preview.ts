import { BufferGeometry, Color, Mesh, MeshBasicNodeMaterial, PerspectiveCamera, PlaneGeometry, Scene, SphereGeometry, WebGPURenderer } from 'three/webgpu';
import type { CompiledSurface } from '@/tsl/compile';
import { createSurfaceMaterial } from '@/tsl/material';

export type Shape = 'sphere' | 'plane';

export interface Preview {
    /** Какой API реально работает: 'WebGPU' или 'WebGL2' (фолбэк). */
    readonly backend: string;
    setSurface(surface: CompiledSurface): void;
    setShape(shape: Shape): void;
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

    renderer.setAnimationLoop(() => {
        if (time) time.value = (performance.now() - start) / 1000;
        mesh.rotation.y += 0.004;
        renderer.render(scene, camera);
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
        setShape(shape) {
            mesh.geometry = geometries[shape];
        },
        dispose() {
            observer.disconnect();
            renderer.setAnimationLoop(null);
            material.dispose();
            Object.values(geometries).forEach((g) => g.dispose());
            renderer.dispose();
        },
    };
}
