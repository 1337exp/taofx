import { Buffer, BufferUsage, Geometry, GlProgram, GpuProgram, Mesh, Shader, type Texture } from 'pixi.js';
import { compileGlsl } from '../glsl/compile';
import { buildPixiParticleShaders } from '../glsl/particleTargets';
import { TIME_UNIFORM } from '../glsl/targets';
import type { Registry } from '../graph/registry';
import type { GraphError } from '../graph/resolve';
import { createDefaultRegistry } from '../nodes';
import { buildQuads2D, buildRibbon2D, quadBuffers, ribbonBuffers } from '../particles/geometry';
import { loadParticleFile } from '../particles/load';
import { createBuffers, createSimulation, trailStrideOf } from '../particles/sim';
import type { ParticleBuffers, ParticleFile } from '../particles/types';
import { compileWgsl, type WgslProgram } from '../wgsl/compile';
import { buildPixiWgslParticles } from '../wgsl/targets';
import { textureResources } from './textures';

export interface PixiParticleOptions {
    registry?: Registry;
    /** Пикселей на мировую единицу системы (в системе размеры и скорости в единицах). По умолчанию 100. */
    scale?: number;
    /** Свои текстуры по имени из графа вместо картинок из файла. */
    textures?: Record<string, Texture>;
}

export interface PixiParticleEffect {
    /** Меш для сцены: ставьте и двигайте его как обычный контейнер, преобразования PIXI применяются. Ось Y системы направлена вверх, на экране вниз. */
    readonly object: Mesh<Geometry, Shader>;
    readonly file: ParticleFile;
    readonly errors: readonly GraphError[];
    /** Ошибки сборки WGSL-версии для рендерера WebGPU (например, у своей ноды нет `wgsl`). Если они есть, на WebGPU частицы пурпурные. */
    readonly gpuErrors: readonly GraphError[];
    /** Выход симуляции на последнем `setTime`: для инструментов вроде оценки заполнения. */
    readonly buffers: ParticleBuffers;
    /** Живых частиц и время последнего расчёта (мс): для бюджета. */
    readonly stats: { live: number; simMs: number };
    setTime(seconds: number): void;
    dispose(): void;
}

const ERROR_PROGRAM = { target: 'pixi-particles' as const, uniforms: '', samplers: [], helpers: '', body: 'vec3 fxColor = vec3(1.0, 0.0, 1.0);\n    float fxOpacity = 1.0;' };
const ERROR_WGSL: WgslProgram = { target: 'pixi-particles', samplers: [], helpers: '', body: 'let fxColor = vec3<f32>(1.0, 0.0, 1.0);\n    let fxOpacity = 1.0;' };

/**
 * Система частиц для PIXI v8 (рендерер WebGL или WebGPU): симуляция на CPU, квадраты или ленты собираются в динамический `Mesh`,
 * вид каждой частицы из графа материала в GLSL. Фильтры и маски PIXI на такой меш действуют как на обычный.
 * В 2D нет глубины, поэтому порядок частиц это порядок рождения (сортировать нечего).
 */
export function createPixiParticles(source: string | ParticleFile, options: PixiParticleOptions = {}): PixiParticleEffect {
    const registry = options.registry ?? createDefaultRegistry();
    const file = loadParticleFile(source, registry);
    const { system } = file;
    const mode = system.render.mode;
    const scale = options.scale ?? 100;
    const sim = createSimulation(system);
    const sim3 = createBuffers(system.maxParticles, trailStrideOf(system));
    const mesh = mode === 'ribbon' ? ribbonBuffers(system.maxParticles, system.render.trail.segments, 2) : quadBuffers(system.maxParticles, 2);

    const vertex = (data: Float32Array | Uint32Array, usage = BufferUsage.VERTEX) => new Buffer({ data, usage: usage | BufferUsage.COPY_DST });
    const buffers = { position: vertex(mesh.position), uv: vertex(mesh.uv), age: vertex(mesh.age), rand: vertex(mesh.rand), tint: vertex(mesh.tint), alpha: vertex(mesh.alpha) };
    const indexBuffer = vertex(mesh.index, BufferUsage.INDEX);
    const geometry = new Geometry({
        attributes: {
            aPosition: { buffer: buffers.position, format: 'float32x2' },
            aUV: { buffer: buffers.uv, format: 'float32x2' },
            aAge: { buffer: buffers.age, format: 'float32' },
            aRand: { buffer: buffers.rand, format: 'float32' },
            aTint: { buffer: buffers.tint, format: 'float32x3' },
            aAlpha: { buffer: buffers.alpha, format: 'float32' },
        },
        indexBuffer,
    });

    const { program, errors } = compileGlsl(file.material, registry, 'pixi-particles');
    const { vertex: vert, fragment } = buildPixiParticleShaders(program ?? ERROR_PROGRAM);
    const wgsl = compileWgsl(file.material, registry, 'pixi-particles');
    const wgslSource = buildPixiWgslParticles(wgsl.program ?? ERROR_WGSL);
    const shader = new Shader({
        glProgram: new GlProgram({ vertex: vert, fragment, name: 'taofx-particles' }),
        gpuProgram: GpuProgram.from({ vertex: { source: wgslSource, entryPoint: 'mainVertex' }, fragment: { source: wgslSource, entryPoint: 'mainFragment' }, name: 'taofx-particles' }),
        resources: { fxUniforms: { [TIME_UNIFORM]: { value: 0, type: 'f32' } }, ...textureResources(program ?? wgsl.program ?? ERROR_PROGRAM, file.material, options.textures) },
    });
    const object = new Mesh({ geometry, shader });
    if (system.blend === 'add') object.blendMode = 'add';

    let previousIndices = 0;
    const stats = { live: 0, simMs: 0 };

    return {
        object,
        file,
        errors,
        gpuErrors: wgsl.errors,
        buffers: sim3,
        stats,
        setTime(seconds) {
            shader.resources.fxUniforms.uniforms[TIME_UNIFORM] = seconds;
            const t0 = performance.now();
            const count = sim.seek(seconds, sim3);
            stats.live = count;
            stats.simMs = performance.now() - t0;

            const built = mode === 'ribbon' ? buildRibbon2D(sim3, count, system.render.trail, scale, mesh) : buildQuads2D(sim3, count, mode === 'stretch' ? system.render.stretch : null, scale, mesh);
            // индексов меньше, чем в прошлый раз: хвост обнуляем, треугольники нулевой площади не рисуются
            if (built.indices < previousIndices) mesh.index.fill(0, built.indices, previousIndices);
            previousIndices = built.indices;
            for (const b of Object.values(buffers)) b.update();
            indexBuffer.update();
        },
        dispose() {
            object.destroy();
            geometry.destroy();
            shader.destroy();
        },
    };
}
