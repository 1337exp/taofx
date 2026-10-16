import { createCamera, MAX_ZOOM, MIN_ZOOM, type Camera } from '@1337exp/taoux/camera';
import type { NodeInstance } from '@/graph/types';

/** Оценка размера ноды для «показать всё»: точный размер известен только вёрстке. */
const NODE_ESTIMATE = { w: 210, h: 120 };
const FIT_PADDING = 48;

/** Камера, при которой все ноды видны целиком в области `viewport` (по оценке их размеров); пустой граф даёт камеру по умолчанию. */
export function fitCamera(nodes: readonly Pick<NodeInstance, 'x' | 'y'>[], viewport: { w: number; h: number }): Camera {
    if (nodes.length === 0) return createCamera();
    const left = Math.min(...nodes.map((n) => n.x));
    const top = Math.min(...nodes.map((n) => n.y));
    const right = Math.max(...nodes.map((n) => n.x + NODE_ESTIMATE.w));
    const bottom = Math.max(...nodes.map((n) => n.y + NODE_ESTIMATE.h));
    const { w, h } = viewport;
    const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min((w - FIT_PADDING * 2) / (right - left), (h - FIT_PADDING * 2) / (bottom - top))));
    return { x: (w - (right - left) * z) / 2 - left * z, y: (h - (bottom - top) * z) / 2 - top * z, z };
}
