import { AdditiveBlending, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, PlaneGeometry, ShaderMaterial } from 'three';
import { compileGlsl } from '../glsl/compile';
import { buildThreeParticleShader } from '../glsl/particleTargets';
import { TIME_UNIFORM } from '../glsl/targets';
import type { Registry } from '../graph/registry';
import type { GraphError } from '../graph/resolve';
import { createDefaultRegistry } from '../nodes';
import { loadParticleFile } from '../particles/load';
import { createBuffers, createSimulation } from '../particles/sim';
import type { ParticleFile } from '../particles/types';

export interface GlslParticleOptions {
    registry?: Registry;
}

export interface GlslParticleEffect {
    readonly object: Mesh;
    readonly file: ParticleFile;
    readonly errors: readonly GraphError[];
    setTime(seconds: number): void;
    dispose(): void;
}

const ERROR_PROGRAM = { target: 'three-particles' as const, helpers: '', body: 'vec3 fxColor = vec3(1.0, 0.0, 1.0);\n    float fxOpacity = 1.0;' };

/** Система частиц для three.js с классическим `WebGLRenderer`: тот же файл, вид из графа собран в GLSL. */
export function createGlslParticles(source: string | ParticleFile, options: GlslParticleOptions = {}): GlslParticleEffect {
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
    const specs: [string, Float32Array, number][] = [
        ['aPos', buffers.pos, 3],
        ['aSize', buffers.size, 1],
        ['aRot', buffers.rot, 1],
        ['aAge', buffers.age, 1],
        ['aRand', buffers.rand, 1],
        ['aTint', buffers.tint, 3],
        ['aAlpha', buffers.alpha, 1],
    ];
    const attrs = specs.map(([name, data, size]) => {
        const a = new InstancedBufferAttribute(data, size);
        a.setUsage(35048);
        geometry.setAttribute(name, a);
        return a;
    });
    geometry.instanceCount = 0;

    const { program, errors } = compileGlsl(file.material, registry, 'three-particles');
    const { vertexShader, fragmentShader } = buildThreeParticleShader(program ?? ERROR_PROGRAM);
    const uniforms = { [TIME_UNIFORM]: { value: 0 } };
    const material = new ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false });
    if (system.blend === 'add') material.blending = AdditiveBlending;

    const object = new Mesh(geometry, material);
    object.frustumCulled = false;

    return {
        object,
        file,
        errors,
        setTime(seconds) {
            uniforms[TIME_UNIFORM].value = seconds;
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
