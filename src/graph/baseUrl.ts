// Адреса картинок в файле эффекта, лежащем не рядом со страницей: пакет для игры (`bundle`) хранит их путями от файла
// (`textures/лист.png`), а браузер читает `src` относительно страницы. `withBaseUrl` делает их абсолютными.

const ABSOLUTE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i; // data:, blob:, http:, https:, //хост/...

/** Адрес `src` относительно `baseUrl` (сам `baseUrl` относительный: от адреса страницы, если она есть). Готовые адреса остаются как есть. */
export function resolveSrc(src: string, baseUrl: string): string {
    if (ABSOLUTE.test(src) || src.startsWith('/')) return src;
    const page = (globalThis as { location?: { href?: string } }).location?.href;
    const base = ABSOLUTE.test(baseUrl) ? baseUrl : new URL(baseUrl, page ?? 'http://localhost/').href;
    return new URL(src, base).href;
}

/**
 * Файл эффекта (`taofx` или `taofx-particles`, текст) с адресами картинок, разрешёнными относительно `baseUrl` (адрес самого файла
 * или его папки). Текст, который не разобрать, и файл без картинок возвращаются как есть: ошибку покажет обычная загрузка.
 */
export function withBaseUrl(source: string, baseUrl: string): string {
    let file: { graph?: { textures?: Record<string, { src?: unknown }> }; material?: { textures?: Record<string, { src?: unknown }> } } | null;
    try {
        file = JSON.parse(source);
    } catch {
        return source;
    }
    const graph = file?.material ?? file?.graph;
    const textures = graph?.textures;
    if (!file || !textures || typeof textures !== 'object') return source;
    for (const texture of Object.values(textures)) {
        if (texture && typeof texture.src === 'string') texture.src = resolveSrc(texture.src, baseUrl);
    }
    return JSON.stringify(file);
}

/**
 * Загружает файл эффекта по адресу и сразу разрешает адреса его картинок относительно этого адреса: пакет из редактора
 * (`эффект.json` и `textures/…` рядом) работает из любой папки, а не только если страница лежит рядом с ним.
 */
export async function fetchEffectText(url: string, init?: RequestInit): Promise<string> {
    const response = await fetch(url, init);
    if (!response.ok) throw new Error(`Cannot load effect: ${response.status} ${url}`);
    return withBaseUrl(await response.text(), url);
}
