import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'uv/flipbook',
    title: 'Flipbook',
    inputs: {
        uv: { type: 'vec2', fallback: 'uv' },
        columns: { type: 'float', default: 4 },
        rows: { type: 'float', default: 4 },
        phase: { type: 'float', default: 0 },
    },
    outputs: { uv: { type: 'vec2' } },
    // Спрайт-лист: картинка поделена на columns × rows кадров; phase 0…1 пробегает все кадры подряд
    // (0 первый, 1 последний), кадры считаются слева направо и сверху вниз. Подайте возраст частицы: получится анимация жизни.
    glsl: ({ uv, columns, rows, phase }, ctx) => {
        ctx.helper(
            'fxFlipbook',
            `vec2 fxFlipbook(vec2 uv, float columns, float rows, float phase) {
    float c = max(floor(columns), 1.0);
    float r = max(floor(rows), 1.0);
    float frame = floor(clamp(phase, 0.0, 0.999999) * c * r);
    float col = mod(frame, c);
    float row = floor(frame / c);
    return (uv + vec2(col, r - 1.0 - row)) / vec2(c, r);
}`,
        );
        return { uv: `fxFlipbook(${uv}, ${columns}, ${rows}, ${phase})` };
    },
    wgsl: ({ uv, columns, rows, phase }, ctx) => {
        ctx.helper(
            'fxFlipbook',
            `fn fxFlipbook(uv: vec2<f32>, columns: f32, rows: f32, phase: f32) -> vec2<f32> {
    let c = max(floor(columns), 1.0);
    let r = max(floor(rows), 1.0);
    let frame = floor(clamp(phase, 0.0, 0.999999) * c * r);
    let col = frame - c * floor(frame / c);
    let row = floor(frame / c);
    return (uv + vec2<f32>(col, r - 1.0 - row)) / vec2<f32>(c, r);
}`,
        );
        return { uv: `fxFlipbook(${uv}, ${columns}, ${rows}, ${phase})` };
    },
});
