import { DepthTexture, HalfFloatType, NearestFilter, UnsignedIntType, Vector2, Vector3, WebGLRenderTarget, type Camera, type Object3D, type Scene, type Texture, type WebGLRenderer } from 'three';
import type { Capability } from '../graph/types';
import { SCENE_CAMERA_UNIFORM, SCENE_COLOR_UNIFORM, SCENE_DEPTH_UNIFORM, SCENE_SIZE_UNIFORM } from '../glsl/scene';

/**
 * Данные уже нарисованной (непрозрачной) сцены, которые нужны эффектам: глубина для мягких частиц и цвет для рефракции.
 * У WebGPURenderer (`@1337exp/taofx/tsl`) всё это есть само, а у классического WebGLRenderer игра отдаёт текстуры.
 * Размеры текстур должны совпадать с буфером, в который рисуются эффекты (по `gl_FragCoord`).
 */
export interface SceneInputs {
    /** Глубина сцены (`DepthTexture`): включает ноду «Затухание по глубине». */
    readonly depth: Texture | null;
    /** Линейный цвет сцены: включает ноду «Цвет сцены». */
    readonly color: Texture | null;
    /** Размер буфера сцены в пикселях. */
    readonly width: number;
    readonly height: number;
}

/**
 * Готовый источник `SceneInputs`: рисует сцену без эффектов в свой буфер (цвет и глубина), откуда эффекты читают данные.
 * Это второй проход по сцене: если у игры уже есть такой буфер (постобработка), отдавайте его напрямую как `SceneInputs`.
 *
 * ```ts
 * const capture = createSceneCapture(renderer);
 * const fx = createGlslParticles(text, { scene: capture });
 * // каждый кадр: сначала снимок без эффектов, потом обычная отрисовка
 * capture.render(scene, camera, [fx.object]);
 * renderer.render(scene, camera);
 * ```
 */
export interface SceneCapture extends SceneInputs {
    /** Рисует `scene` в буфер; объекты из `hidden` (обычно эффекты) на это время скрыты. */
    render(scene: Scene, camera: Camera, hidden?: readonly Object3D[]): void;
    /** Меняет размер буфера (вызывайте при изменении размера холста). */
    setSize(width: number, height: number): void;
    dispose(): void;
}

export function createSceneCapture(renderer: WebGLRenderer, size?: { width: number; height: number }): SceneCapture {
    const drawing = renderer.getDrawingBufferSize(new Vector2());
    const width = size?.width ?? drawing.x;
    const height = size?.height ?? drawing.y;
    const depth = new DepthTexture(width, height, UnsignedIntType);
    depth.minFilter = depth.magFilter = NearestFilter;
    // цвет в половинной точности: линейные значения без полос в тёмных тонах
    const target = new WebGLRenderTarget(width, height, { type: HalfFloatType, depthTexture: depth });

    return {
        get depth() {
            return target.depthTexture;
        },
        get color() {
            return target.texture;
        },
        get width() {
            return target.width;
        },
        get height() {
            return target.height;
        },
        render(scene, camera, hidden = []) {
            const before = hidden.map((o) => o.visible);
            hidden.forEach((o) => (o.visible = false));
            const previous = renderer.getRenderTarget();
            renderer.setRenderTarget(target);
            renderer.clear();
            renderer.render(scene, camera);
            renderer.setRenderTarget(previous);
            hidden.forEach((o, i) => (o.visible = before[i]!));
        },
        setSize(w, h) {
            target.setSize(w, h);
        },
        dispose() {
            target.dispose();
            depth.dispose();
        },
    };
}

/** Что рантайм добавляет к возможностям цели и какие uniform'ы заводит, когда игра отдала `SceneInputs`. */
export interface SceneBinding {
    /** Возможности, которые даёт игра: `depth` и `sceneColor` по тому, какие текстуры у неё есть. */
    readonly capabilities: Capability[];
    readonly uniforms: Record<string, { value: unknown }>;
    /** Переносит в uniform'ы текстуры, размер и камеру; зовётся перед каждой отрисовкой. */
    update(camera: Camera): void;
}

export function bindScene(inputs: SceneInputs | undefined): SceneBinding {
    const uniforms = {
        [SCENE_DEPTH_UNIFORM]: { value: null as Texture | null },
        [SCENE_COLOR_UNIFORM]: { value: null as Texture | null },
        [SCENE_SIZE_UNIFORM]: { value: new Vector2(1, 1) },
        [SCENE_CAMERA_UNIFORM]: { value: new Vector3(0.1, 100, 0) },
    };
    const capabilities: Capability[] = [];
    if (inputs?.depth) capabilities.push('depth');
    if (inputs?.color) capabilities.push('sceneColor');

    return {
        capabilities,
        uniforms,
        update(camera) {
            if (!inputs) return;
            uniforms[SCENE_DEPTH_UNIFORM].value = inputs.depth;
            uniforms[SCENE_COLOR_UNIFORM].value = inputs.color;
            uniforms[SCENE_SIZE_UNIFORM].value.set(inputs.width, inputs.height);
            const c = camera as Camera & { near?: number; far?: number; isOrthographicCamera?: boolean };
            uniforms[SCENE_CAMERA_UNIFORM].value.set(c.near ?? 0.1, c.far ?? 100, c.isOrthographicCamera ? 1 : 0);
        },
    };
}
