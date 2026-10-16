import { attribute, cameraProjectionMatrix, cos, modelViewMatrix, positionGeometry, sin, vec2, vec4 } from 'three/tsl';
import { AdditiveBlending, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, type Texture } from 'three/webgpu';
import type { Registry } from '../graph/registry';
import type { GraphError } from '../graph/resolve';
import { createDefaultRegistry } from '../nodes';
import { loadParticleFile } from '../particles/load';
import { createBuffers, createSimulation } from '../particles/sim';
import type { ParticleFile } from '../particles/types';
import { tslBuilders } from './builders';
import { compile } from './compile';
import { createSurfaceMaterial, errorSurface } from './material';
import { graphTextures } from './textures';
import type { TslBuild } from './types';

export interface ParticleEffectOptions {
    registry?: Registry;
    builders?: Record<string, TslBuild>;
    /** Свои текстуры по имени из графа вместо картинок из файла. */
    textures?: Record<string, Texture>;
}

export interface ParticleEffect {
    /** Меш для сцены: одна геометрия с инстансами, по частице на инстанс. */
    readonly object: Mesh;
    readonly file: ParticleFile;
    readonly errors: readonly GraphError[];
    /** Перематывает систему на момент `seconds` и обновляет частицы (и время для ноды «Время»). Вызывайте каждый кадр. */
    setTime(seconds: number): void;
    dispose(): void;
}

/**
 * Система частиц из файла редактора для three.js с `WebGPURenderer`: симуляция на CPU, вид каждой частицы из графа материала
 * (нода «Частица» отдаёт долю жизни, случайное число и цвет из градиента).
 */
export function createParticles(source: string | ParticleFile, options: ParticleEffectOptions = {}): ParticleEffect {
    const registry = options.registry ?? createDefaultRegistry();
    const file = loadParticleFile(source, registry);
    const { system } = file;
    const sim = createSimulation(system);
    const buffers = createBuffers(system.maxParticles);

    const plane = new PlaneGeometry(1, 1);
    const geometry = new InstancedBufferGeometry();
    geometry.index = plane.index;
    geometry.setAttribute('position', plane.getAttribute('position'));
    geometry.setAttribute('uv', plane.getAttribute('uv'));
    const instanced = (name: string, data: Float32Array, size: number) => {
        const a = new InstancedBufferAttribute(data, size);
        a.setUsage(35048); // DynamicDrawUsage
        geometry.setAttribute(name, a);
        return a;
    };
    const attrs = [
        instanced('aPos', buffers.pos, 3),
        instanced('aSize', buffers.size, 1),
        instanced('aRot', buffers.rot, 1),
        instanced('aAge', buffers.age, 1),
        instanced('aRand', buffers.rand, 1),
        instanced('aTint', buffers.tint, 3),
        instanced('aAlpha', buffers.alpha, 1),
    ];
    geometry.instanceCount = 0;

    const particle = {
        age: attribute('aAge', 'float'),
        random: attribute('aRand', 'float'),
        tint: attribute('aTint', 'vec3'),
        alpha: attribute('aAlpha', 'float'),
    };
    const { surface, errors } = compile(file.material, registry, { ...tslBuilders, ...options.builders }, { particle, textures: graphTextures(file.material, options.textures) });
    const used = surface ?? errorSurface();
    const material = createSurfaceMaterial(used);

    // квадрат частицы поворачивается и лежит лицом к камере: смещение считаем в пространстве камеры
    const center = attribute('aPos', 'vec3');
    const rot = attribute('aRot', 'float');
    const c = cos(rot);
    const s = sin(rot);
    const local = positionGeometry.xy;
    const offset = vec2(local.x.mul(c).sub(local.y.mul(s)), local.x.mul(s).add(local.y.mul(c))).mul(attribute('aSize', 'float'));
    const view = modelViewMatrix.mul(vec4(center, 1));
    material.vertexNode = cameraProjectionMatrix.mul(vec4(view.xy.add(offset), view.z, 1));
    material.depthWrite = false;
    if (system.blend === 'add') material.blending = AdditiveBlending;

    const object = new Mesh(geometry, material);
    object.frustumCulled = false;

    return {
        object,
        file,
        errors,
        setTime(seconds) {
            used.time.value = seconds;
            geometry.instanceCount = sim.seek(seconds, buffers);
            for (const a of attrs) a.needsUpdate = true;
        },
        dispose() {
            geometry.dispose();
            plane.dispose();
            material.dispose();
        },
    };
}
