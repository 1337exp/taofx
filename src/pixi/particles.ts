import { Buffer, BufferUsage, Geometry, GlProgram, Mesh, Shader, type Texture } from 'pixi.js';
import { compileGlsl } from '../glsl/compile';
import { buildPixiParticleShaders } from '../glsl/particleTargets';
import { TIME_UNIFORM } from '../glsl/targets';
import type { Registry } from '../graph/registry';
import type { GraphError } from '../graph/resolve';
import { createDefaultRegistry } from '../nodes';
import { loadParticleFile } from '../particles/load';
import { createBuffers, createSimulation } from '../particles/sim';
import type { ParticleFile } from '../particles/types';
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
    setTime(seconds: number): void;
    dispose(): void;
}

const ERROR_PROGRAM = { target: 'pixi-particles' as const, uniforms: '', samplers: [], helpers: '', body: 'vec3 fxColor = vec3(1.0, 0.0, 1.0);\n    float fxOpacity = 1.0;' };

/** Углы квадрата в системе, где Y вверх: от нижнего левого против часовой. */
const CORNERS: [number, number][] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];

/**
 * Система частиц для PIXI v8 (рендерер WebGL): симуляция на CPU, квадраты частиц собираются в динамический `Mesh`,
 * вид каждой частицы из графа материала в GLSL. Фильтры и маски PIXI на такой меш действуют как на обычный.
 */
export function createPixiParticles(source: string | ParticleFile, options: PixiParticleOptions = {}): PixiParticleEffect {
    const registry = options.registry ?? createDefaultRegistry();
    const file = loadParticleFile(source, registry);
    const { system } = file;
    const scale = options.scale ?? 100;
    const sim = createSimulation(system);
    const sim3 = createBuffers(system.maxParticles);
    const n = system.maxParticles;

    const position = new Float32Array(n * 4 * 2);
    const uv = new Float32Array(n * 4 * 2);
    const age = new Float32Array(n * 4);
    const rand = new Float32Array(n * 4);
    const tint = new Float32Array(n * 4 * 3);
    const alpha = new Float32Array(n * 4);
    const indices = new Uint32Array(n * 6);
    for (let i = 0; i < n; i++) {
        const v = i * 4;
        indices.set([v, v + 1, v + 2, v, v + 2, v + 3], i * 6);
        CORNERS.forEach(([lx, ly], k) => {
            uv[(v + k) * 2] = lx + 0.5;
            uv[(v + k) * 2 + 1] = ly + 0.5;
        });
    }

    const vertex = (data: Float32Array) => new Buffer({ data, usage: BufferUsage.VERTEX | BufferUsage.COPY_DST });
    const buffers = { position: vertex(position), age: vertex(age), rand: vertex(rand), tint: vertex(tint), alpha: vertex(alpha) };
    const geometry = new Geometry({
        attributes: {
            aPosition: { buffer: buffers.position, format: 'float32x2' },
            aUV: { buffer: vertex(uv), format: 'float32x2' },
            aAge: { buffer: buffers.age, format: 'float32' },
            aRand: { buffer: buffers.rand, format: 'float32' },
            aTint: { buffer: buffers.tint, format: 'float32x3' },
            aAlpha: { buffer: buffers.alpha, format: 'float32' },
        },
        indexBuffer: new Buffer({ data: indices, usage: BufferUsage.INDEX | BufferUsage.COPY_DST }),
    });

    const { program, errors } = compileGlsl(file.material, registry, 'pixi-particles');
    const { vertex: vert, fragment } = buildPixiParticleShaders(program ?? ERROR_PROGRAM);
    const shader = new Shader({
        glProgram: new GlProgram({ vertex: vert, fragment, name: 'taofx-particles' }),
        resources: { fxUniforms: { [TIME_UNIFORM]: { value: 0, type: 'f32' } }, ...textureResources(program ?? ERROR_PROGRAM, file.material, options.textures) },
    });
    const object = new Mesh({ geometry, shader });
    if (system.blend === 'add') object.blendMode = 'add';

    let previous = 0;

    return {
        object,
        file,
        errors,
        setTime(seconds) {
            shader.resources.fxUniforms.uniforms[TIME_UNIFORM] = seconds;
            const count = sim.seek(seconds, sim3);
            for (let i = 0; i < count; i++) {
                const cx = sim3.pos[i * 3]! * scale;
                const cy = -sim3.pos[i * 3 + 1]! * scale;
                const size = sim3.size[i]! * scale;
                const c = Math.cos(sim3.rot[i]!);
                const s = Math.sin(sim3.rot[i]!);
                for (let k = 0; k < 4; k++) {
                    const [lx, ly] = CORNERS[k]!;
                    const v = i * 4 + k;
                    position[v * 2] = cx + (lx * c - ly * s) * size;
                    position[v * 2 + 1] = cy - (lx * s + ly * c) * size;
                    age[v] = sim3.age[i]!;
                    rand[v] = sim3.rand[i]!;
                    tint[v * 3] = sim3.tint[i * 3]!;
                    tint[v * 3 + 1] = sim3.tint[i * 3 + 1]!;
                    tint[v * 3 + 2] = sim3.tint[i * 3 + 2]!;
                    alpha[v] = sim3.alpha[i]!;
                }
            }
            // освободившиеся квадраты схлопываем в точку: треугольники нулевой площади не рисуются
            for (let i = count; i < previous; i++) position.fill(0, i * 8, i * 8 + 8);
            previous = count;
            for (const b of Object.values(buffers)) b.update();
        },
        dispose() {
            object.destroy();
            geometry.destroy();
            shader.destroy();
        },
    };
}
