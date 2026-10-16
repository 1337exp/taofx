import { ImageSource, Texture, type TextureSource } from 'pixi.js';
import type { GlslProgram } from '../glsl/compile';
import type { Graph } from '../graph/types';

// Одну и ту же картинку (по адресу) грузим один раз.
const cache = new Map<string, Texture>();
const CACHE_LIMIT = 32;

/** Текстура по адресу: возвращается сразу, картинка догружается сама (пока она не пришла, текстура пустая). */
export function loadTexture(src: string): Texture {
    const cached = cache.get(src);
    if (cached) return cached;
    if (cache.size >= CACHE_LIMIT) {
        const oldest = cache.keys().next().value as string;
        cache.get(oldest)?.destroy(true);
        cache.delete(oldest);
    }
    // Пока картинка не пришла, в источнике лежит холст 1x1: пустой <img> загрузить в GPU нельзя
    const placeholder = document.createElement('canvas');
    placeholder.width = placeholder.height = 1;
    const source = new ImageSource({ resource: placeholder });
    const texture = new Texture({ source });

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
        source.resource = image;
        source.resize(image.naturalWidth, image.naturalHeight);
        source.unload(); // следующий кадр загрузит новую картинку в GPU
    };
    image.src = src;
    cache.set(src, texture);
    return texture;
}

/** Освобождает загруженные картинки. */
export function clearTextureCache(): void {
    for (const t of cache.values()) t.destroy(true);
    cache.clear();
}

/** Ресурсы текстур для шейдера: свои `overrides` (по имени из графа) важнее картинок из файла. */
export function textureResources(program: GlslProgram, graph: Graph, overrides: Record<string, Texture> = {}): Record<string, TextureSource> {
    const resources: Record<string, TextureSource> = {};
    for (const s of program.samplers) {
        const src = graph.textures?.[s.texture]?.src;
        const texture = overrides[s.texture] ?? (src ? loadTexture(src) : Texture.EMPTY);
        resources[s.uniform] = texture.source;
    }
    return resources;
}
