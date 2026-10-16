import type { GlslProgram } from './compile';

/** Имя uniform времени: одно для всех целей, его обновляет игра (`setTime`). */
export const TIME_UNIFORM = 'uTime';

export interface ThreeShaderSource {
    vertexShader: string;
    fragmentShader: string;
}

/**
 * Каркас для `ShaderMaterial` three.js (WebGLRenderer): передаёт в фрагментный шейдер uv, нормаль и направление взгляда
 * в пространстве камеры. Вывод через `colorspace_fragment`: цвета графа линейные, а на экран идут в sRGB, как у TSL-материала.
 */
export function buildThreeShader(program: GlslProgram): ThreeShaderSource {
    return {
        vertexShader: /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewDir;
void main() {
    vUv = uv;
    vNormalView = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    // как в TSL: у ортографической камеры направление взгляда постоянное (0, 0, 1), а не к точке
    vViewDir = projectionMatrix[3][3] == 1.0 ? vec3(0.0, 0.0, 1.0) : normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
}`,
        fragmentShader: /* glsl */ `
varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewDir;
uniform float ${TIME_UNIFORM};
${program.helpers}
void main() {
    ${program.body}
    gl_FragColor = vec4(fxColor, fxOpacity);
    #include <colorspace_fragment>
}`,
    };
}

/**
 * Фрагментный шейдер фильтра PIXI v8 (вершинный берётся стандартный, `defaultFilterVert`). Эффект рисуется внутри
 * силуэта спрайта: непрозрачность умножается на альфу исходной картинки. PIXI ждёт цвет с премультипликацией и не
 * переводит его в sRGB сам, поэтому линейный цвет графа переводим здесь. uv перевёрнут по вертикали, чтобы совпадать с three.js
 * (там начало слева внизу).
 */
export function buildPixiFragment(program: GlslProgram): string {
    // Версия 300 es нужна и шуму (целочисленные операции), и PIXI: только по этой строке он собирает шейдер как WebGL2 без заплаток под WebGL1.
    return /* glsl */ `#version 300 es
precision highp float;
precision highp int;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform float ${TIME_UNIFORM};
${program.helpers}
vec3 fxLinearToSrgb(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(hi, lo, lessThanEqual(c, vec3(0.0031308)));
}
void main() {
    vec2 vUv = vec2(vTextureCoord.x, 1.0 - vTextureCoord.y);
    vec4 fxSrc = texture(uTexture, vTextureCoord);
    vec3 fxSrcRgb = fxSrc.a > 0.0 ? fxSrc.rgb / fxSrc.a : vec3(0.0);
    ${program.body}
    float a = fxOpacity * fxSrc.a;
    finalColor = vec4(fxLinearToSrgb(fxColor) * a, a);
}`;
}
