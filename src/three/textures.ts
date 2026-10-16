import { SRGBColorSpace, TextureLoader, type Texture } from 'three';
import type { GlslProgram } from '../glsl/compile';
import type { Graph } from '../graph/types';

// Одну и ту же картинку (по адресу) грузим один раз.
const cache = new Map<string, Texture>();
const CACHE_LIMIT = 32;

/** Текстура по адресу: возвращается сразу, картинка догружается сама. Цвет читается как sRGB (шейдер получает линейный). */
export function loadTexture(src: string): Texture {
    const cached = cache.get(src);
    if (cached) return cached;
    if (cache.size >= CACHE_LIMIT) {
        const oldest = cache.keys().next().value as string;
        cache.get(oldest)?.dispose();
        cache.delete(oldest);
    }
    const texture = new TextureLoader().load(src);
    texture.colorSpace = SRGBColorSpace;
    cache.set(src, texture);
    return texture;
}

/** Освобождает загруженные картинки. */
export function clearTextureCache(): void {
    for (const t of cache.values()) t.dispose();
    cache.clear();
}

/** Uniform'ы текстур для `ShaderMaterial`: свои `overrides` (по имени из графа) важнее картинок из файла. */
export function textureUniforms(program: GlslProgram, graph: Graph, overrides: Record<string, Texture> = {}): Record<string, { value: Texture | null }> {
    const uniforms: Record<string, { value: Texture | null }> = {};
    for (const s of program.samplers) {
        const src = graph.textures?.[s.texture]?.src;
        uniforms[s.uniform] = { value: overrides[s.texture] ?? (src ? loadTexture(src) : null) };
    }
    return uniforms;
}
