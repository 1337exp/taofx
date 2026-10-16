import { float, uniform, vec3 } from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import type { CompiledSurface } from './compile';

/**
 * Вешает собранную поверхность на материал. Материал прозрачный: непрозрачность идёт из графа,
 * а постоянную единицу от переменной отличить нельзя.
 */
export function applySurface(material: MeshBasicNodeMaterial, surface: CompiledSurface): MeshBasicNodeMaterial {
    material.colorNode = surface.color;
    material.opacityNode = surface.opacity;
    material.transparent = true;
    material.needsUpdate = true;
    return material;
}

export const createSurfaceMaterial = (surface: CompiledSurface): MeshBasicNodeMaterial => applySurface(new MeshBasicNodeMaterial(), surface);

/** Поверхность на случай, когда граф не собрался: пурпурный, как «нет шейдера» в движках, чтобы ошибку было видно. */
export const errorSurface = (): CompiledSurface => ({ color: vec3(1, 0, 1), opacity: float(1), time: uniform(0) });
