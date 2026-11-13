import { confirm } from '@1337exp/taoui';
import { isLocaleCode, LOCALE_CODES, LOCALE_NAMES, setLocale, useI18n } from '@/i18n';
import { createEditorCommands, type EditorCommands } from './commands';
import { layout } from './layout';
import { usePreviewState } from './state/preview';
import { useEditor } from './store';
import { ui } from './ui';

let shared: EditorCommands | undefined;

/**
 * Команды редактора для приложения: один реестр на всё окно. Создаётся при первом обращении (когда уже есть Pinia и язык),
 * потом все области (верхняя строка, палитра, клавиши) берут один и тот же.
 */
export function useEditorCommands(): EditorCommands {
    if (shared) return shared;
    const editor = useEditor();
    const { t, locale } = useI18n();

    /** Выбор файла без постоянного `<input>` в разметке: создаётся на лету (клик по нему разрешён в ответ на жест пользователя). */
    function pickFile() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.taofx,.json,application/zip,application/json';
        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (file) void editor.openFile(file);
        });
        input.click();
    }

    shared = createEditorCommands({
        editor,
        preview: usePreviewState(),
        layout,
        ui,
        t,
        locale: () => locale.value,
        setLocale: (code) => isLocaleCode(code) && setLocale(code),
        languages: LOCALE_CODES.map((code) => ({ code, name: LOCALE_NAMES[code] })),
        confirmDiscard: async () => !editor.dirty || confirm(t('file.discardTitle')).message(t('file.discardMessage')).danger().ok(t('file.discard')),
        pickFile,
    });
    return shared;
}
