import { describe, expect, it, vi } from 'vitest';
import { createAssetCache } from '@/graph/assetCache';

const make = (limit?: number) => {
    const create = vi.fn((key: string) => ({ key }));
    const dispose = vi.fn();
    return { create, dispose, cache: createAssetCache(create, dispose, limit) };
};

describe('кэш ресурсов', () => {
    it('создаёт ресурс один раз на ключ', () => {
        const { cache, create } = make();
        const a = cache.get('a.png');
        expect(cache.get('a.png')).toBe(a);
        expect(create).toHaveBeenCalledTimes(1);
        expect(cache.get('b.png')).not.toBe(a);
        expect(cache.size).toBe(2);
    });

    it('при переполнении вытесняет самый давно нужный и освобождает его', () => {
        const { cache, create, dispose } = make(2);
        const a = cache.get('a');
        const b = cache.get('b');
        cache.get('a'); // a снова нужен: давний теперь b
        cache.get('c');
        expect(dispose).toHaveBeenCalledTimes(1);
        expect(dispose).toHaveBeenCalledWith(b);
        expect(cache.size).toBe(2);
        expect(cache.get('a')).toBe(a);
        expect(create).toHaveBeenCalledTimes(3);
        cache.get('b'); // вытесненный создаётся заново
        expect(create).toHaveBeenCalledTimes(4);
    });

    it('clear освобождает всё и забывает ключи', () => {
        const { cache, create, dispose } = make();
        cache.get('a');
        cache.get('b');
        cache.clear();
        expect(dispose).toHaveBeenCalledTimes(2);
        expect(cache.size).toBe(0);
        cache.get('a');
        expect(create).toHaveBeenCalledTimes(3);
    });
});
