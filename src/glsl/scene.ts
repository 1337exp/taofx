/**
 * Данные сцены для GLSL-целей three.js (классический WebGLRenderer): у него нет автоматического доступа к глубине и цвету
 * уже отрисованного, поэтому игра отдаёт их текстурами (`SceneInputs` в `@1337exp/taofx/three`), а шейдер читает по этим именам.
 */

/** Глубина непрозрачной сцены (DepthTexture). */
export const SCENE_DEPTH_UNIFORM = 'uSceneDepth';
/** Линейный цвет непрозрачной сцены. */
export const SCENE_COLOR_UNIFORM = 'uSceneColor';
/** Размер буфера сцены в пикселях (vec2): по нему gl_FragCoord превращается в uv. */
export const SCENE_SIZE_UNIFORM = 'uSceneSize';
/** Камера: near, far и 1 для ортографической (vec3). Рантайм заполняет её сам при отрисовке. */
export const SCENE_CAMERA_UNIFORM = 'uSceneCamera';

/** Размер буфера сцены: общий для глубины и цвета (объявляется один раз). */
export const SCENE_SIZE_GLSL = /* glsl */ `uniform vec2 ${SCENE_SIZE_UNIFORM};`;

/** Расстояние вдоль взгляда от камеры до сцены в этом пикселе (в единицах сцены): основа ноды «Затухание по глубине». Нужен `SCENE_SIZE_GLSL`. */
export const SCENE_DEPTH_GLSL = /* glsl */ `uniform sampler2D ${SCENE_DEPTH_UNIFORM};
uniform vec3 ${SCENE_CAMERA_UNIFORM};
float fxSceneViewDepth() {
    float d = texture(${SCENE_DEPTH_UNIFORM}, gl_FragCoord.xy / ${SCENE_SIZE_UNIFORM}).x;
    float near = ${SCENE_CAMERA_UNIFORM}.x;
    float far = ${SCENE_CAMERA_UNIFORM}.y;
    if (${SCENE_CAMERA_UNIFORM}.z > 0.5) return near + d * (far - near);
    float z = d * 2.0 - 1.0;
    return 2.0 * near * far / (far + near - z * (far - near));
}`;

/** Цвет сцены за этой точкой экрана со сдвигом `offset` (в долях экрана). Нужен `SCENE_SIZE_GLSL`. */
export const SCENE_COLOR_GLSL = /* glsl */ `uniform sampler2D ${SCENE_COLOR_UNIFORM};
vec3 fxSceneColor(vec2 offset) {
    return texture(${SCENE_COLOR_UNIFORM}, gl_FragCoord.xy / ${SCENE_SIZE_UNIFORM} + offset).rgb;
}`;
