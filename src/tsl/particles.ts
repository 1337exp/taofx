import { attribute, cameraProjectionMatrix, cos, cross, float, modelViewMatrix, positionGeometry, select, sin, uniform, uv, vec2, vec3, vec4 } from 'three/tsl';
import { AdditiveBlending, BufferAttribute, BufferGeometry, DoubleSide, InstancedBufferAttribute, InstancedBufferGeometry, Mesh, MeshBasicNodeMaterial, PlaneGeometry, type Texture } from 'three/webgpu';
import type { Registry } from '../graph/registry';
import type { GraphError } from '../graph/resolve';
import { createDefaultRegistry } from '../nodes';
import { createDriver3D } from '../particles/driver';
import { viewInObject, type ViewPoint } from '../particles/geometry';
import { loadParticleFile } from '../particles/load';
import type { ParticleBuffers, ParticleFile } from '../particles/types';
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
    /** Меш для сцены: инстансы (по частице на инстанс) или лента, как задано в системе. */
    readonly object: Mesh;
    readonly file: ParticleFile;
    readonly errors: readonly GraphError[];
    /** Выход симуляции на последнем `setTime` (положения, размеры, возраст): для инструментов вроде оценки заполнения. */
    readonly buffers: ParticleBuffers;
    /** Живых частиц и время последнего расчёта (мс): для бюджета. */
    readonly stats: { live: number; simMs: number };
    /** Пересчитывает систему на момент `seconds` (и время для ноды «Время»). Вызывайте каждый кадр перед отрисовкой: сортировка по глубине идёт по камере прошлой отрисовки. */
    setTime(seconds: number): void;
    /**
     * Отладочный вид: `overdraw` рисует каждый пиксель частиц одним и тем же слабым цветом со сложением, так что яркость
     * это число перекрытий (по 8/255 на слой, до 32), независимо от графа материала. Редактор раскрашивает это в тепловую карту.
     */
    setDebug(mode: 'overdraw' | null): void;
    dispose(): void;
}

/** Сколько яркости (из 255) добавляет один слой в режиме `overdraw`. */
export const OVERDRAW_STEP = 8;

/**
 * Система частиц из файла редактора для three.js с `WebGPURenderer`: симуляция на CPU, вид каждой частицы из графа материала
 * (нода «Частица» отдаёт долю жизни, случайное число и цвет из градиента).
 */
export function createParticles(source: string | ParticleFile, options: ParticleEffectOptions = {}): ParticleEffect {
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
            a.setUsage(35048); // DynamicDrawUsage
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

    // 1, если камера ортографическая (ленте тогда нужен постоянный взгляд вместо направления на точку); ставим перед отрисовкой
    const orthographic = uniform(0);

    const particle = {
        age: attribute('aAge', 'float'),
        random: attribute('aRand', 'float'),
        tint: attribute('aTint', 'vec3'),
        alpha: attribute('aAlpha', 'float'),
    };
    const { surface, errors } = compile(file.material, registry, { ...tslBuilders, ...options.builders }, { particle, textures: graphTextures(file.material, options.textures) });
    const used = surface ?? errorSurface();
    const material = createSurfaceMaterial(used);

    if (mode !== 'ribbon') {
        // квадрат частицы лежит лицом к камере: смещение считаем в пространстве камеры
        const center = attribute('aPos', 'vec3');
        const size = attribute('aSize', 'float');
        const local = positionGeometry.xy;
        const view = modelViewMatrix.mul(vec4(center, 1));
        let offset;
        if (mode === 'stretch') {
            // вытянут вдоль скорости на экране: ось X квадрата идёт по скорости, длина растёт со скоростью
            const vv = modelViewMatrix.mul(vec4(attribute('aVel', 'vec3'), 0)).xyz;
            const l2 = vv.xy.length();
            const dir = select(l2.greaterThan(1e-5), vv.xy.div(l2.max(1e-5)), vec2(1, 0));
            const perp = vec2(dir.y.negate(), dir.x);
            const len = size.mul(vv.length().mul(system.render.stretch).add(1));
            offset = dir.mul(local.x.mul(len)).add(perp.mul(local.y.mul(size)));
        } else {
            const rot = attribute('aRot', 'float');
            const c = cos(rot);
            const s = sin(rot);
            offset = vec2(local.x.mul(c).sub(local.y.mul(s)), local.x.mul(s).add(local.y.mul(c))).mul(size);
        }
        material.vertexNode = cameraProjectionMatrix.mul(vec4(view.xy.add(offset), view.z, 1));
    } else {
        // Лента: вершины пары совпадают, лицом к камере полосу разворачиваем здесь (касательная × направление на камеру) и разносим на ширину
        const mv = modelViewMatrix.mul(vec4(positionGeometry, 1)).xyz;
        const eye = select(orthographic.greaterThan(0.5), vec3(0, 0, -1), mv);
        const raw = cross(modelViewMatrix.mul(vec4(attribute('aTan', 'vec3'), 0)).xyz, eye);
        const rawLength = raw.length();
        const side = select(rawLength.greaterThan(1e-9), raw.div(rawLength.max(1e-9)), vec3(1, 0, 0));
        const shifted = mv.add(side.mul(attribute('aWidth', 'float').mul(uv().y.mul(2).sub(1))));
        material.vertexNode = cameraProjectionMatrix.mul(vec4(shifted, 1));
        material.side = DoubleSide;
    }
    material.depthWrite = false;
    if (system.blend === 'add') material.blending = AdditiveBlending;

    const object = new Mesh(geometry, material);
    object.frustumCulled = false;

    // Камера нужна только для порядка отрисовки (от дальних к ближним): берём по камере прошлой отрисовки, разница в кадр не видна.
    // Данные готовятся сразу в setTime, до отрисовки (так их загружают оба рендерера, WebGL и WebGPU).
    const view: ViewPoint = { position: [0, 0, 0], forward: [0, 0, -1] };
    let haveView = false;
    object.onBeforeRender = (_renderer, _scene, camera) => {
        object.updateWorldMatrix(true, false);
        camera.updateWorldMatrix(true, false);
        viewInObject(camera.matrixWorld.elements, object.matrixWorld.elements, view);
        haveView = true;
        orthographic.value = (camera as { isOrthographicCamera?: boolean }).isOrthographicCamera ? 1 : 0;
    };

    const stats = { live: 0, simMs: 0 };
    let debugMaterial: MeshBasicNodeMaterial | null = null;

    return {
        object,
        file,
        errors,
        buffers: driver.buffers,
        stats,
        setTime(seconds) {
            used.time.value = seconds;
            const t0 = performance.now();
            stats.live = driver.seek(seconds);
            const prepared = driver.prepare(haveView ? view : null);
            stats.simMs = performance.now() - t0;
            if (mode === 'ribbon') geometry.setDrawRange(0, prepared.indices);
            else (geometry as InstancedBufferGeometry).instanceCount = prepared.instances;
            for (const r of refresh) r();
        },
        setDebug(mode) {
            if (mode === null) {
                object.material = material;
                return;
            }
            if (!debugMaterial) {
                // тот же способ расстановки вершин, цвет постоянный; глубину не проверяем: считаем всё, что шейдер выполнил бы
                debugMaterial = new MeshBasicNodeMaterial();
                debugMaterial.colorNode = vec3(OVERDRAW_STEP / 255);
                debugMaterial.opacityNode = float(1);
                debugMaterial.transparent = true;
                debugMaterial.blending = AdditiveBlending;
                debugMaterial.depthTest = false;
                debugMaterial.depthWrite = false;
                debugMaterial.side = DoubleSide;
                if (material.vertexNode) debugMaterial.vertexNode = material.vertexNode;
            }
            object.material = debugMaterial;
        },
        dispose() {
            geometry.dispose();
            plane?.dispose();
            material.dispose();
            debugMaterial?.dispose();
        },
    };
}
