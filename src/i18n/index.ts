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

export const { applyLocale, setLocale, initLocale, translate, detectLocale } = i18n;

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
