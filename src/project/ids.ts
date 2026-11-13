// Стабильные id ресурсов. Путь файла можно менять, id остаётся: по нему ссылаются друг на друга документы.

/** Без похожих знаков (нет 0, o, 1, l, i, u): id удобно читать и диктовать. 30 знаков. */
const ALPHABET = 'abcdefghjkmnpqrstvwxyz23456789';
export const ID_LENGTH = 10;

/** Годится ли строка как id (в файлах, написанных руками или другой версией, длина и набор могут быть другими). */
export const isId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9]{6,32}$/.test(value);

/** Источник случайных байтов; подменяется в тестах. */
export type RandomBytes = (count: number) => Uint8Array;

const systemRandom: RandomBytes = (count) => {
    const bytes = new Uint8Array(count);
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (typeof c?.getRandomValues === 'function') c.getRandomValues(bytes);
    else for (let i = 0; i < count; i++) bytes[i] = Math.floor(Math.random() * 256);
    return bytes;
};

/**
 * Новый случайный id (10 знаков, около 49 бит). `taken` пропускает уже занятые. Байты, дающие перекос по алфавиту
 * (остаток от деления 256 на 30), отбрасываются, поэтому все знаки равновероятны.
 */
export function newId(taken: (id: string) => boolean = () => false, random: RandomBytes = systemRandom): string {
    const limit = 256 - (256 % ALPHABET.length);
    for (;;) {
        let id = '';
        while (id.length < ID_LENGTH) {
            for (const byte of random(ID_LENGTH * 2)) {
                if (byte >= limit) continue;
                id += ALPHABET[byte % ALPHABET.length];
                if (id.length === ID_LENGTH) break;
            }
        }
        if (!taken(id)) return id;
    }
}
