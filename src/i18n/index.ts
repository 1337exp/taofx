import { localeEn, localeRu, setTaoLocale } from '@1337exp/taoui';
import { createI18n, type MessageArgs, type Paths } from '@1337exp/taoux/i18n';
import { FALLBACK_LOCALE, LOCALES, type LocaleCode } from './locales';
import type ru from './locales/ru';

export * from './locales';
export type { MessageArgs };

/** Все допустимые ключи словаря: 'file.save', 'palette.add', ... Тексты нод (`nodeTexts`) сюда не входят. */
export type MessageKey = Paths<Omit<typeof ru, 'nodeTexts'>>;

const i18n = createI18n<typeof LOCALES, MessageKey>({
    locales: LOCALES,
    fallback: FALLBACK_LOCALE,
    storageKey: 'taofx.locale',
});

export const { translate, detectLocale } = i18n;

// Тексты самих компонентов TaoUI (подписи в календаре, «Очистить» и т.п.) переключаются вместе с нашим языком
const taoLocales = { ru: localeRu, en: localeEn } as const;
const syncTao = (code: LocaleCode) => setTaoLocale(taoLocales[code]);

export const applyLocale = (code: LocaleCode): void => {
    i18n.applyLocale(code);
    syncTao(code);
};
export const setLocale = (code: LocaleCode): void => {
    i18n.setLocale(code);
    syncTao(code);
};
export const initLocale = (): LocaleCode => {
    const code = i18n.initLocale();
    syncTao(code);
    return code;
};

/** Минимум, что нужно знать о ноде, чтобы её назвать. */
interface Titled {
    id: string;
    title: string;
}

//--------------------------------------------------
// Тексты нод: перевод необязателен, запасной вариант: английский текст из файла ноды.

export function translateNodeTitle(code: LocaleCode, def: Titled): string {
    return LOCALES[code].nodeTexts.nodes[def.id]?.title ?? def.title;
}

export function translatePinLabel(code: LocaleCode, nodeId: string, pinName: string, fallback?: string): string {
    return LOCALES[code].nodeTexts.nodes[nodeId]?.pins?.[pinName] ?? fallback ?? pinName;
}

export function translateCategory(code: LocaleCode, category: string): string {
    return LOCALES[code].nodeTexts.categories[category] ?? category.charAt(0).toUpperCase() + category.slice(1);
}

export function useI18n() {
    const base = i18n.useI18n();
    return {
        ...base,
        nodeTitle: (def: Titled) => translateNodeTitle(base.locale.value, def),
        pinLabel: (nodeId: string, pinName: string, fallback?: string) => translatePinLabel(base.locale.value, nodeId, pinName, fallback),
        categoryTitle: (category: string) => translateCategory(base.locale.value, category),
    };
}
