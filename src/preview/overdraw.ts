import { color, mix, positionGeometry, smoothstep, texture, screenUV, vec4 } from 'three/tsl';
import { Mesh, MeshBasicNodeMaterial, OrthographicCamera, PlaneGeometry, RenderTarget, Scene, UnsignedByteType } from 'three/webgpu';
import { OVERDRAW_STEP } from '@/tsl/particles';

/** Тепловая карта перекрытий: сколько слоёв частиц закрашивает пиксель → цвет. Те же остановки рисует легенда в интерфейсе. */
export const HEAT_STOPS: readonly { layers: number; color: string }[] = [
    { layers: 1, color: '#3b3bb0' },
    { layers: 2, color: '#2a7fff' },
    { layers: 4, color: '#25d4d4' },
    { layers: 6, color: '#3fd45a' },
    { layers: 8, color: '#e8e030' },
    { layers: 12, color: '#ff7a1a' },
    { layers: 16, color: '#ff2a2a' },
    { layers: 24, color: '#ffffff' },
];

/** Предел счёта: в 8 битах по `OVERDRAW_STEP` на слой помещается 255 / 8 ≈ 31 слой. */
export const HEAT_MAX_LAYERS = Math.floor(255 / OVERDRAW_STEP);

export interface HeatMap {
    /** Сюда рисуются частицы в режиме `overdraw`. */
    readonly target: RenderTarget;
    /** Сцена из одного полноэкранного квадрата, раскрашивающего счёт слоёв. Рисуется поверх обычного кадра. */
    readonly overlay: Scene;
    readonly camera: OrthographicCamera;
    setSize(width: number, height: number): void;
    dispose(): void;
}

export function createHeatMap(width: number, height: number): HeatMap {
    const target = new RenderTarget(width, height, { type: UnsignedByteType, depthBuffer: false });

    // слоёв = яркость · 255 / шаг; цвет — цепочка смешиваний по остановкам, непрозрачность растёт от 0,5 слоя
    const layers = texture(target.texture, screenUV).r.mul(255 / OVERDRAW_STEP);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let heat: any = color(HEAT_STOPS[0]!.color);
    for (let i = 1; i < HEAT_STOPS.length; i++) {
        const a = HEAT_STOPS[i - 1]!.layers;
        const b = HEAT_STOPS[i]!.layers;
        heat = mix(heat, color(HEAT_STOPS[i]!.color), layers.sub(a).div(b - a).saturate());
    }
    const material = new MeshBasicNodeMaterial();
    material.colorNode = heat;
    material.opacityNode = smoothstep(0.3, 0.7, layers).mul(0.88);
    material.transparent = true;
    material.depthTest = false;
    material.depthWrite = false;
    material.vertexNode = vec4(positionGeometry.xy, 0, 1); // сразу в координатах экрана

    const geometry = new PlaneGeometry(2, 2);
    const overlay = new Scene();
    const quad = new Mesh(geometry, material);
    quad.frustumCulled = false;
    overlay.add(quad);

    return {
        target,
        overlay,
        camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
        setSize: (w, h) => target.setSize(w, h),
        dispose() {
            target.dispose();
            geometry.dispose();
            material.dispose();
        },
    };
}
