import type { GlslProgram } from './compile';
import { TIME_UNIFORM } from './targets';

export interface ParticleShaderSource {
    vertexShader: string;
    fragmentShader: string;
}

/**
 * Каркас для частиц в three.js (`ShaderMaterial` на `InstancedBufferGeometry`): квадрат на каждую частицу, повёрнутый
 * лицом к камере. Данные частицы приходят инстансными атрибутами и уходят в фрагментный шейдер варьингами, откуда их читает нода «Частица».
 */
export function buildThreeParticleShader(program: GlslProgram): ParticleShaderSource {
    return {
        vertexShader: /* glsl */ `
attribute vec3 aPos;
attribute float aSize;
attribute float aRot;
attribute float aAge;
attribute float aRand;
attribute vec3 aTint;
attribute float aAlpha;
varying vec2 vUv;
varying float vAge;
varying float vRand;
varying vec3 vTint;
varying float vAlpha;
void main() {
    vUv = uv;
    vAge = aAge;
    vRand = aRand;
    vTint = aTint;
    vAlpha = aAlpha;
    float c = cos(aRot);
    float s = sin(aRot);
    vec2 offset = vec2(position.x * c - position.y * s, position.x * s + position.y * c) * aSize;
    vec4 mv = modelViewMatrix * vec4(aPos, 1.0);
    mv.xy += offset;
    gl_Position = projectionMatrix * mv;
}`,
        fragmentShader: /* glsl */ `
varying vec2 vUv;
varying float vAge;
varying float vRand;
varying vec3 vTint;
varying float vAlpha;
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
