import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchEffectText, resolveSrc, withBaseUrl } from '@/graph/baseUrl';

afterEach(() => vi.unstubAllGlobals());

describe('адреса картинок относительно файла эффекта', () => {
    it('путь от файла становится абсолютным; готовые адреса остаются как есть', () => {
        const base = 'https://game.example/fx/boom/effect.json';
        expect(resolveSrc('textures/sheet.png', base)).toBe('https://game.example/fx/boom/textures/sheet.png');
        expect(resolveSrc('../shared/a.png', base)).toBe('https://game.example/fx/shared/a.png');
        expect(resolveSrc('data:image/png;base64,AAAA', base)).toBe('data:image/png;base64,AAAA');
        expect(resolveSrc('blob:https://x/1', base)).toBe('blob:https://x/1');
        expect(resolveSrc('https://cdn.example/a.png', base)).toBe('https://cdn.example/a.png');
        expect(resolveSrc('//cdn.example/a.png', base)).toBe('//cdn.example/a.png');
        expect(resolveSrc('/root/a.png', base)).toBe('/root/a.png');
    });

    it('относительный базовый адрес считается от адреса страницы', () => {
        vi.stubGlobal('location', { href: 'https://game.example/play/index.html' });
        expect(resolveSrc('textures/a.png', './fx/boom.json')).toBe('https://game.example/play/fx/textures/a.png');
        expect(resolveSrc('textures/a.png', '/fx/boom.json')).toBe('https://game.example/fx/textures/a.png');
    });

    it('без страницы (Node) база это localhost', () => {
        vi.stubGlobal('location', undefined);
        expect(resolveSrc('a.png', 'fx/boom.json')).toBe('http://localhost/fx/a.png');
    });

    const base = 'https://g.example/fx/e.json';
    const textures = { sheet: { src: 'textures/sheet.png' }, remote: { src: 'https://cdn.example/r.png' } };

    it('файл частиц: адреса в материале разрешаются, остальное не тронуто', () => {
        const source = JSON.stringify({ format: 'taofx-particles', version: 1, system: { seed: 1 }, material: { nodes: {}, connections: [], textures } });
        const out = JSON.parse(withBaseUrl(source, base));
        expect(out.material.textures.sheet.src).toBe('https://g.example/fx/textures/sheet.png');
        expect(out.material.textures.remote.src).toBe('https://cdn.example/r.png');
        expect(out.system).toEqual({ seed: 1 });
    });

    it('файл материала: адреса в графе', () => {
        const source = JSON.stringify({ format: 'taofx', version: 1, graph: { nodes: {}, connections: [], textures } });
        expect(JSON.parse(withBaseUrl(source, base)).graph.textures.sheet.src).toBe('https://g.example/fx/textures/sheet.png');
    });

    it('нечего разрешать или текст негоден: возвращается как есть', () => {
        const none = JSON.stringify({ format: 'taofx', version: 1, graph: { nodes: {}, connections: [] } });
        expect(withBaseUrl(none, base)).toBe(none);
        expect(withBaseUrl('это не json', base)).toBe('это не json');
        expect(withBaseUrl('null', base)).toBe('null');
        const odd = JSON.stringify({ graph: { textures: { a: { src: 5 }, b: null } } });
        expect(JSON.parse(withBaseUrl(odd, base)).graph.textures).toEqual({ a: { src: 5 }, b: null });
    });

    it('загрузка по адресу: текст приходит с разрешёнными картинками, ошибка ответа бросается', async () => {
        const body = JSON.stringify({ format: 'taofx', version: 1, graph: { nodes: {}, connections: [], textures } });
        vi.stubGlobal('fetch', vi.fn(async (url: string) => (url.endsWith('missing.json') ? new Response('', { status: 404 }) : new Response(body))));
        const text = await fetchEffectText('https://g.example/fx/e.json');
        expect(JSON.parse(text).graph.textures.sheet.src).toBe('https://g.example/fx/textures/sheet.png');
        await expect(fetchEffectText('https://g.example/fx/missing.json')).rejects.toThrow('404');
    });
});
