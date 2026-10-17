import { SRGBColorSpace, TextureLoader, type Texture } from 'three';
import { createAssetCache } from '../graph/assetCache';
import type { GlslProgram } from '../glsl/compile';
import type { Graph } from '../graph/types';

// Одну и ту же картинку (по адресу) грузим один раз.
const cache = createAssetCache<Texture>(
    (src) => {
        const texture = new TextureLoader().load(src);
        texture.colorSpace = SRGBColorSpace;
        return texture;
    },
    (texture) => texture.dispose(),
);

/** Текстура по адресу: возвращается сразу, картинка догружается сама. Цвет читается как sRGB (шейдер получает линейный). */
export const loadTexture = (src: string): Texture => cache.get(src);

/** Освобождает загруженные картинки. */
export const clearTextureCache = (): void => cache.clear();

/** Uniform'ы текстур для `ShaderMaterial`: свои `overrides` (по имени из графа) важнее картинок из файла. */
export function textureUniforms(program: GlslProgram, graph: Graph, overrides: Record<string, Texture> = {}): Record<string, { value: Texture | null }> {
    const uniforms: Record<string, { value: Texture | null }> = {};
    for (const s of program.samplers) {
        const src = graph.textures?.[s.texture]?.src;
        uniforms[s.uniform] = { value: overrides[s.texture] ?? (src ? loadTexture(src) : null) };
    }
    return uniforms;
}
