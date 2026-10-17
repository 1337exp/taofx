/**
 * Кэш ресурсов по ключу (адрес картинки): каждый ресурс создаётся один раз, при переполнении вытесняется самый давний.
 * Один и тот же код нужен каждому рендереру (three, tsl, pixi); отличаются только создание и освобождение ресурса,
 * поэтому они передаются снаружи. Сами текстуры у рендереров свои (объект GPU нельзя отдать другому рендереру).
 */
export interface AssetCache<T> {
    /** Ресурс по ключу: берёт из кэша или создаёт. */
    get(key: string): T;
    /** Освобождает и забывает все ресурсы. */
    clear(): void;
    readonly size: number;
}

export function createAssetCache<T>(create: (key: string) => T, dispose: (value: T) => void, limit = 32): AssetCache<T> {
    // Map помнит порядок вставки: первый ключ самый давний. Обращение переносит ключ в конец, поэтому вытесняется
    // именно давно не нужная картинка, а не просто первая загруженная.
    const items = new Map<string, T>();

    return {
        get(key) {
            if (items.has(key)) {
                const value = items.get(key)!;
                items.delete(key);
                items.set(key, value);
                return value;
            }
            if (items.size >= limit) {
                const oldest = items.keys().next().value as string;
                dispose(items.get(oldest)!);
                items.delete(oldest);
            }
            const value = create(key);
            items.set(key, value);
            return value;
        },
        clear() {
            for (const value of items.values()) dispose(value);
            items.clear();
        },
        get size() {
            return items.size;
        },
    };
}
