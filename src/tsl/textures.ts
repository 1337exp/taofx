import { SRGBColorSpace, TextureLoader, type Texture } from 'three/webgpu';
import type { Graph } from '../graph/types';

/** Находит текстуру по имени из `Graph.textures`. */
export type TextureLookup = (name: string) => Texture | undefined;

// Одну и ту же картинку (по адресу) грузим один раз: редактор пересобирает материал при каждой правке графа.
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

/** Освобождает загруженные картинки (редактору и тестам; игре это нужно, только если она сама ушла с эффекта насовсем). */
export function clearTextureCache(): void {
    for (const t of cache.values()) t.dispose();
    cache.clear();
}

/**
 * Откуда брать текстуры графа: свои `overrides` (по имени) важнее картинок из файла.
 * Так игра подставляет текстуру из своего загрузчика, не трогая файл эффекта.
 */
export function graphTextures(graph: Graph, overrides: Record<string, Texture> = {}): TextureLookup {
    return (name) => overrides[name] ?? (graph.textures?.[name] ? loadTexture(graph.textures[name]!.src) : undefined);
}
