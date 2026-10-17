import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial, type Texture } from 'three';
import { compileGlsl } from '../glsl/compile';
import { buildThreeParticleShader, STRETCH_UNIFORM } from '../glsl/particleTargets';
import { TIME_UNIFORM } from '../glsl/targets';
import type { Registry } from '../graph/registry';
import type { GraphError } from '../graph/resolve';
import { createDefaultRegistry } from '../nodes';
import { createDriver3D } from '../particles/driver';
import { viewInObject, type ViewPoint } from '../particles/geometry';
import { loadParticleFile } from '../particles/load';
import type { ParticleBuffers, ParticleFile } from '../particles/types';
import { bindScene, type SceneInputs } from './scene';
import { textureUniforms } from './textures';

export interface GlslParticleOptions {
    registry?: Registry;
    /** Свои текстуры по имени из графа вместо картинок из файла. */
    textures?: Record<string, Texture>;
    /** Глубина и цвет сцены: без них ноды «Затухание по глубине» и «Цвет сцены» не соберутся (см. `createSceneCapture`). */
    scene?: SceneInputs;
}

export interface GlslParticleEffect {
    readonly object: Mesh;
    readonly file: ParticleFile;
    readonly errors: readonly GraphError[];
    /** Выход симуляции на последнем `setTime` (положения, размеры, возраст): для инструментов вроде оценки заполнения. */
    readonly buffers: ParticleBuffers;
    /** Живых частиц и время последнего расчёта (мс): для бюджета. */
    readonly stats: { live: number; simMs: number };
    /** Пересчитывает систему на момент `seconds`; вызывайте каждый кадр. Сортировку и ленту под камеру рантайм делает сам при отрисовке. */
    setTime(seconds: number): void;
    dispose(): void;
}

const ERROR_PROGRAM = { target: 'three-particles' as const, uniforms: '', samplers: [], helpers: '', body: 'vec3 fxColor = vec3(1.0, 0.0, 1.0);\n    float fxOpacity = 1.0;' };

/** Система частиц для three.js с классическим `WebGLRenderer`: тот же файл, вид из графа собран в GLSL. */
export function createGlslParticles(source: string | ParticleFile, options: GlslParticleOptions = {}): GlslParticleEffect {
    const registry = options.registry ?? createDefaultRegistry();
    const file = loadParticleFile(source, registry);
    const { system } = file;
    const driver = createDriver3D(system);
    const mode = system.render.mode;

    // Геометрия: инстансы (квадрат на частицу) или обычный меш для ленты
    let geometry: BufferGeometry;
    const refresh: (() => void)[] = [];
    let plane: PlaneGeometry | null = null;
    if (mode === 'ribbon') {
        const r = driver.ribbon!;
        geometry = new BufferGeometry();
        const add = (name: string, data: Float32Array, size: number) => {
            const a = new BufferAttribute(data, size);
            a.setUsage(35048);
            geometry.setAttribute(name, a);
            refresh.push(() => (a.needsUpdate = true));
        };
        add('position', r.position, 3);
        add('aTan', r.tangent, 3);
        add('aWidth', r.width, 1);
        add('uv', r.uv, 2);
        add('aAge', r.age, 1);
        add('aRand', r.rand, 1);
        add('aTint', r.tint, 3);
        add('aAlpha', r.alpha, 1);
        const index = new BufferAttribute(r.index, 1);
        index.setUsage(35048);
        geometry.setIndex(index);
        refresh.push(() => (index.needsUpdate = true));
    } else {
        plane = new PlaneGeometry(1, 1);
        const g = new InstancedBufferGeometry();
        g.index = plane.index;
        g.setAttribute('position', plane.getAttribute('position'));
        g.setAttribute('uv', plane.getAttribute('uv'));
        const b = driver.instances;
        const specs: [string, Float32Array, number][] = [
            ['aPos', b.pos, 3],
            ['aSize', b.size, 1],
            ['aAge', b.age, 1],
            ['aRand', b.rand, 1],
            ['aTint', b.tint, 3],
            ['aAlpha', b.alpha, 1],
            mode === 'stretch' ? ['aVel', b.vel, 3] : ['aRot', b.rot, 1],
        ];
        for (const [name, data, size] of specs) {
            const a = new InstancedBufferAttribute(data, size);
            a.setUsage(35048);
            g.setAttribute(name, a);
            refresh.push(() => (a.needsUpdate = true));
        }
        g.instanceCount = 0;
        geometry = g;
    }

    const scene = bindScene(options.scene);
    const { program, errors } = compileGlsl(file.material, registry, 'three-particles', scene.capabilities);
    const { vertexShader, fragmentShader } = buildThreeParticleShader(program ?? ERROR_PROGRAM, mode);
    const uniforms: Record<string, { value: unknown }> = { [TIME_UNIFORM]: { value: 0 }, [STRETCH_UNIFORM]: { value: system.render.stretch }, ...scene.uniforms, ...textureUniforms(program ?? ERROR_PROGRAM, file.material, options.textures) };
    const material = new ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false });
    if (mode === 'ribbon') material.side = DoubleSide;
    if (system.blend === 'add') material.blending = AdditiveBlending;

    const object = new Mesh(geometry, material);
    object.frustumCulled = false;

    // Камера нужна только для порядка отрисовки (от дальних к ближним). Данные загружаются на GPU до отрисовки (WebGLRenderer
    // обновляет буферы раньше, чем зовёт onBeforeRender), поэтому порядок берётся по камере прошлой отрисовки: разница в кадр не видна.
    const view: ViewPoint = { position: [0, 0, 0], forward: [0, 0, -1] };
    let haveView = false;
    object.onBeforeRender = (_renderer, _scene, camera) => {
        scene.update(camera);
        object.updateWorldMatrix(true, false);
        camera.updateWorldMatrix(true, false);
        viewInObject(camera.matrixWorld.elements, object.matrixWorld.elements, view);
        haveView = true;
    };

    const stats = { live: 0, simMs: 0 };

    return {
        object,
        file,
        errors,
        buffers: driver.buffers,
        stats,
        setTime(seconds) {
            uniforms[TIME_UNIFORM]!.value = seconds;
            const t0 = performance.now();
            stats.live = driver.seek(seconds);
            const prepared = driver.prepare(haveView ? view : null);
            stats.simMs = performance.now() - t0;
            if (mode === 'ribbon') geometry.setDrawRange(0, prepared.indices);
            else (geometry as InstancedBufferGeometry).instanceCount = prepared.instances;
            for (const r of refresh) r();
        },
        dispose() {
            geometry.dispose();
            plane?.dispose();
            material.dispose();
        },
    };
}
