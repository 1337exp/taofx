import { defineNode } from '../../graph/registry';

export default defineNode({
    id: 'input/texture',
    title: 'Texture',
    inputs: { uv: { type: 'vec2', fallback: 'uv' } },
    outputs: { color: { type: 'color' }, alpha: { type: 'float' } },
    params: { texture: { type: 'texture' } },
    // Цвет линейный, альфа прямая (без премультипликации); uv с началом внизу слева, как у three. Пока вход uv не подключён,
    // берутся координаты самой поверхности (квадрата частицы, меша).
    glsl: ({ uv }, ctx) => {
        const name = ctx.params.texture;
        if (!name) throw new Error('No texture selected');
        return { color: `${ctx.texture(name, uv ?? 'vUv')}.rgb`, alpha: `${ctx.texture(name, uv ?? 'vUv')}.a` };
    },
    wgsl: ({ uv }, ctx) => {
        const name = ctx.params.texture;
        if (!name) throw new Error('No texture selected');
        return { color: `${ctx.texture(name, uv ?? 'vUv')}.rgb`, alpha: `${ctx.texture(name, uv ?? 'vUv')}.a` };
    },
});
