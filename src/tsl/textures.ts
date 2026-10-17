import { SRGBColorSpace, TextureLoader, type Texture } from 'three/webgpu';
import { createAssetCache } from '../graph/assetCache';
import type { Graph } from '../graph/types';

/** Находит текстуру по имени из `Graph.textures`. */
export type TextureLookup = (name: string) => Texture | undefined;

// Одну и ту же картинку (по адресу) грузим один раз: редактор пересобирает материал при каждой правке графа.
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

/** Освобождает загруженные картинки (редактору и тестам; игре это нужно, только если она сама ушла с эффекта насовсем). */
export const clearTextureCache = (): void => cache.clear();

/**
 * Откуда брать текстуры графа: свои `overrides` (по имени) важнее картинок из файла.
 * Так игра подставляет текстуру из своего загрузчика, не трогая файл эффекта.
 */
export function graphTextures(graph: Graph, overrides: Record<string, Texture> = {}): TextureLookup {
    return (name) => overrides[name] ?? (graph.textures?.[name] ? loadTexture(graph.textures[name]!.src) : undefined);
}
