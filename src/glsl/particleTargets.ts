import type { RenderMode } from '../particles/types';
import type { GlslProgram } from './compile';
import { TIME_UNIFORM } from './targets';

export interface ParticleShaderSource {
    vertexShader: string;
    fragmentShader: string;
}

/** Имя uniform вытягивания (режим `stretch`). */
export const STRETCH_UNIFORM = 'uStretch';

const THREE_VARYINGS = /* glsl */ `
varying vec2 vUv;
varying float vAge;
varying float vRand;
varying vec3 vTint;
varying float vAlpha;
varying float vViewDepth;`;

const THREE_FRAGMENT = (program: GlslProgram) => /* glsl */ `${THREE_VARYINGS}
uniform float ${TIME_UNIFORM};
${program.uniforms}
${program.helpers}
void main() {
    ${program.body}
    gl_FragColor = vec4(fxColor, fxOpacity);
    #include <colorspace_fragment>
}`;

/**
 * Каркас для частиц в three.js (`ShaderMaterial`). Данные частицы приходят атрибутами и уходят в фрагментный шейдер
 * варьингами, откуда их читает нода «Частица». Режимы:
 *   billboard  инстансы: квадрат на частицу, повёрнутый лицом к камере;
 *   stretch    инстансы: квадрат вытянут вдоль скорости на экране (длина = размер · (1 + stretch · скорость));
 *   ribbon     обычный меш: вершины уже в пространстве системы (их собирает CPU), атрибуты на вершину.
 */
export function buildThreeParticleShader(program: GlslProgram, mode: RenderMode = 'billboard'): ParticleShaderSource {
    const fragmentShader = THREE_FRAGMENT(program);
    const common = /* glsl */ `
attribute float aAge;
attribute float aRand;
attribute vec3 aTint;
attribute float aAlpha;${THREE_VARYINGS}
void fxPass() {
    vUv = uv;
    vAge = aAge;
    vRand = aRand;
    vTint = aTint;
    vAlpha = aAlpha;
}`;

    if (mode === 'ribbon') {
        // вершины пары совпадают: лицом к камере полосу разворачиваем здесь (касательная × направление на камеру) и разносим на ширину
        return {
            vertexShader: /* glsl */ `${common}
attribute vec3 aTan;
attribute float aWidth;
void main() {
    fxPass();
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vec3 eye = projectionMatrix[3][3] == 1.0 ? vec3(0.0, 0.0, -1.0) : mv.xyz;
    vec3 side = cross(mat3(modelViewMatrix) * aTan, eye);
    float sl = length(side);
    side = sl > 1e-9 ? side / sl : vec3(1.0, 0.0, 0.0);
    mv.xyz += side * (aWidth * (uv.y * 2.0 - 1.0));
    vViewDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
}`,
            fragmentShader,
        };
    }
    if (mode === 'stretch') {
        return {
            vertexShader: /* glsl */ `${common}
attribute vec3 aPos;
attribute vec3 aVel;
attribute float aSize;
uniform float ${STRETCH_UNIFORM};
void main() {
    fxPass();
    vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
    vec3 vv = mat3(modelViewMatrix) * aVel;
    float l2 = length(vv.xy);
    vec2 d = l2 > 1e-5 ? vv.xy / l2 : vec2(1.0, 0.0);
    vec2 perp = vec2(-d.y, d.x);
    float len = aSize * (1.0 + ${STRETCH_UNIFORM} * length(vv));
    mv.xy += d * (position.x * len) + perp * (position.y * aSize);
    vViewDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
}`,
            fragmentShader,
        };
    }
    return {
        vertexShader: /* glsl */ `${common}
attribute vec3 aPos;
attribute float aSize;
attribute float aRot;
void main() {
    fxPass();
    float c = cos(aRot);
    float s = sin(aRot);
    vec2 offset = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aSize;
    vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
    mv.xy += offset;
    vViewDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
}`,
        fragmentShader,
    };
}

/**
 * Каркас для частиц в PIXI v8 (`Mesh` со своим шейдером): положения вершин уже в координатах контейнера (их считает CPU),
 * поэтому преобразования PIXI (`uProjectionMatrix`, `uWorldTransformMatrix`, `uTransformMatrix`) работают как у обычного меша.
 * Выход с премультипликацией и переводом в sRGB, как у фильтра.
 */
export function buildPixiParticleShaders(program: GlslProgram): { vertex: string; fragment: string } {
    return {
        vertex: /* glsl */ `
in vec2 aPosition;
in vec2 aUV;
in float aAge;
in float aRand;
in vec3 aTint;
in float aAlpha;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
out vec2 vUv;
out float vAge;
out float vRand;
out vec3 vTint;
out float vAlpha;
void main() {
    mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
    gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
    vUv = aUV;
    vAge = aAge;
    vRand = aRand;
    vTint = aTint;
    vAlpha = aAlpha;
}`,
        fragment: /* glsl */ `#version 300 es
precision highp float;
precision highp int;
in vec2 vUv;
in float vAge;
in float vRand;
in vec3 vTint;
in float vAlpha;
out vec4 finalColor;
uniform float ${TIME_UNIFORM};
${program.uniforms}
${program.helpers}
vec3 fxLinearToSrgb(vec3 c) {
    vec3 lo = c * 12.92;
    vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(1.0 / 2.4)) - 0.055;
    return mix(hi, lo, lessThanEqual(c, vec3(0.0031308)));
}
void main() {
    ${program.body}
    finalColor = vec4(fxLinearToSrgb(fxColor) * fxOpacity, fxOpacity);
}`,
    };
}
