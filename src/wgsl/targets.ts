import type { WgslProgram } from './compile';

/** Имя поля времени в структуре uniform'ов эффекта: то же, что `uTime` у GLSL. */
export const WGSL_TIME_FIELD = 'uTime';

/** Имя ресурса со структурой uniform'ов эффекта (по нему PIXI привязывает значения). */
export const WGSL_UNIFORMS_RESOURCE = 'fxUniforms';

/** Объявления текстур и их сэмплеров графа в группе `group`; привязки с 1 (0 занят структурой uniform'ов эффекта). */
function textureBindings(program: WgslProgram, group: number): string {
    return program.samplers.map((s, k) => `@group(${group}) @binding(${1 + 2 * k}) var ${s.uniform}: texture_2d<f32>;\n@group(${group}) @binding(${2 + 2 * k}) var ${s.uniform}Sampler: sampler;`).join('\n');
}

const LINEAR_TO_SRGB = `fn fxLinearToSrgb(c: vec3<f32>) -> vec3<f32> {
    let lo = c * 12.92;
    let hi = 1.055 * pow(max(c, vec3<f32>(0.0)), vec3<f32>(1.0 / 2.4)) - 0.055;
    return select(hi, lo, c <= vec3<f32>(0.0031308));
}`;

/**
 * Шейдер фильтра PIXI v8 для рендерера WebGPU (вершинный и фрагментный в одном источнике, как у встроенных фильтров PIXI).
 * Делает то же, что `buildPixiFragment`: эффект рисуется внутри силуэта спрайта (непрозрачность умножается на его альфу),
 * цвет графа линейный и переводится в sRGB, на выходе премультипликация, uv перевёрнут по вертикали, как в three.js.
 */
export function buildPixiWgslFilter(program: WgslProgram): string {
    return /* wgsl */ `
struct GlobalFilterUniforms {
    uInputSize: vec4<f32>,
    uInputPixel: vec4<f32>,
    uInputClamp: vec4<f32>,
    uOutputFrame: vec4<f32>,
    uGlobalFrame: vec4<f32>,
    uOutputTexture: vec4<f32>,
};
struct FxUniforms {
    ${WGSL_TIME_FIELD}: f32,
};

@group(0) @binding(0) var<uniform> gfu: GlobalFilterUniforms;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(1) @binding(0) var<uniform> ${WGSL_UNIFORMS_RESOURCE}: FxUniforms;
${textureBindings(program, 1)}

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

fn filterVertexPosition(aPosition: vec2<f32>) -> vec4<f32> {
    var position = aPosition * gfu.uOutputFrame.zw + gfu.uOutputFrame.xy;
    position.x = position.x * (2.0 / gfu.uOutputTexture.x) - 1.0;
    position.y = position.y * (2.0 * gfu.uOutputTexture.z / gfu.uOutputTexture.y) - gfu.uOutputTexture.z;
    return vec4<f32>(position, 0.0, 1.0);
}

fn filterTextureCoord(aPosition: vec2<f32>) -> vec2<f32> {
    return aPosition * (gfu.uOutputFrame.zw * gfu.uInputSize.zw);
}

@vertex
fn mainVertex(@location(0) aPosition: vec2<f32>) -> VSOutput {
    return VSOutput(filterVertexPosition(aPosition), filterTextureCoord(aPosition));
}

${LINEAR_TO_SRGB}
${program.helpers}

@fragment
fn mainFragment(@location(0) vTextureCoord: vec2<f32>) -> @location(0) vec4<f32> {
    let vUv = vec2<f32>(vTextureCoord.x, 1.0 - vTextureCoord.y);
    let uTime = ${WGSL_UNIFORMS_RESOURCE}.${WGSL_TIME_FIELD};
    let fxSrc = textureSample(uTexture, uSampler, vTextureCoord);
    let fxSrcRgb = select(vec3<f32>(0.0), fxSrc.rgb / max(fxSrc.a, 1e-9), fxSrc.a > 0.0);
    ${program.body}
    let a = fxOpacity * fxSrc.a;
    return vec4<f32>(fxLinearToSrgb(fxColor) * a, a);
}`;
}

/**
 * Шейдер частиц PIXI v8 для рендерера WebGPU: `Mesh` со своим шейдером. Положения вершин уже в координатах контейнера
 * (их считает CPU), поэтому матрицы PIXI (проекция, мировая, меша) работают как у обычного меша. Выход с премультипликацией
 * и переводом в sRGB, как у `buildPixiParticleShaders`. Объявления `globalUniforms` и `localUniforms` PIXI узнаёт по именам и привязывает сам.
 */
export function buildPixiWgslParticles(program: WgslProgram): string {
    return /* wgsl */ `
struct GlobalUniforms {
    uProjectionMatrix: mat3x3<f32>,
    uWorldTransformMatrix: mat3x3<f32>,
    uWorldColorAlpha: vec4<f32>,
    uResolution: vec2<f32>,
};
struct LocalUniforms {
    uTransformMatrix: mat3x3<f32>,
    uColor: vec4<f32>,
    uRound: f32,
};
struct FxUniforms {
    ${WGSL_TIME_FIELD}: f32,
};

@group(0) @binding(0) var<uniform> globalUniforms: GlobalUniforms;
@group(1) @binding(0) var<uniform> localUniforms: LocalUniforms;
@group(2) @binding(0) var<uniform> ${WGSL_UNIFORMS_RESOURCE}: FxUniforms;
${textureBindings(program, 2)}

struct VSOutput {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
    @location(1) age: f32,
    @location(2) rand: f32,
    @location(3) tint: vec3<f32>,
    @location(4) alpha: f32,
};

@vertex
fn mainVertex(
    @location(0) aPosition: vec2<f32>,
    @location(1) aUV: vec2<f32>,
    @location(2) aAge: f32,
    @location(3) aRand: f32,
    @location(4) aTint: vec3<f32>,
    @location(5) aAlpha: f32,
) -> VSOutput {
    let mvp = globalUniforms.uProjectionMatrix * globalUniforms.uWorldTransformMatrix * localUniforms.uTransformMatrix;
    let p = mvp * vec3<f32>(aPosition, 1.0);
    return VSOutput(vec4<f32>(p.xy, 0.0, 1.0), aUV, aAge, aRand, aTint, aAlpha);
}

${LINEAR_TO_SRGB}
${program.helpers}

@fragment
fn mainFragment(in: VSOutput) -> @location(0) vec4<f32> {
    let vUv = in.uv;
    let vAge = in.age;
    let vRand = in.rand;
    let vTint = in.tint;
    let vAlpha = in.alpha;
    let uTime = ${WGSL_UNIFORMS_RESOURCE}.${WGSL_TIME_FIELD};
    ${program.body}
    return vec4<f32>(fxLinearToSrgb(fxColor) * fxOpacity, fxOpacity);
}`;
}
