// Все действия редактора в одном месте (docs/design.ru.md, идея 5): подпись, сочетание клавиш, «можно ли сейчас», «включено ли»
// и само действие. Меню, кнопки, горячие клавиши и палитра команд только показывают и вызывают их, поэтому не расходятся.
// Механику (реестр, меню из раскладки, клавиши) даёт `taoux/commands`, здесь то, что знает про редактор.

import { createCommands, historyCommands, type Command, type CommandMenuItem, type MenuLayout } from '@1337exp/taoux/commands';
import { downloadText } from '@1337exp/taoux/file';
import type { TaoCommandItem } from '@1337exp/taoui';
import { nextTick } from 'vue';
import type { LocaleCode, MessageArgs, MessageKey } from '@/i18n';
import { FILE_NAME } from './file';
import type { Layout } from './layout';
import type { usePreviewState } from './state/preview';
import type { useEditor } from './store';

type Editor = ReturnType<typeof useEditor>;
type PreviewState = ReturnType<typeof usePreviewState>;

/** Состояние интерфейса, которое не часть ни документа, ни раскладки: открыта ли палитра. */
export interface UiState {
    paletteOpen: boolean;
}

/** От чего зависят команды: хранилища и то, что делает браузер. Подменяется в тестах. */
export interface CommandDeps {
    editor: Editor;
    preview: PreviewState;
    layout: Layout;
    ui: UiState;
    t: (key: MessageKey, args?: MessageArgs) => string;
    locale: () => LocaleCode;
    setLocale: (code: LocaleCode) => void;
    languages: readonly { code: LocaleCode; name: string }[];
    /** Проект живёт в памяти: перед заменой открытого спросить, если есть несохранённое. */
    confirmDiscard: () => Promise<boolean>;
    /** Показать выбор файла и отдать выбранный `editor.openFile`. */
    pickFile: () => void;
}

/** Id команд: на них ссылаются меню, кнопки и тесты. */
export const COMMAND = {
    new: 'new',
    open: 'open',
    save: 'save',
    export: 'export',
    undo: 'undo',
    redo: 'redo',
    viewPreview: 'view.preview',
    viewGraph: 'view.graph',
    viewFit: 'view.fit',
    overdraw: 'view.overdraw',
    environment: 'view.environment',
    fxEnable: 'fx.enable',
    fxDisable: 'fx.disable',
    fxSample: 'fx.sample',
    fxPlay: 'fx.play',
    palette: 'palette',
} as const;

const langId = (code: LocaleCode) => `lang.${code}`;

export function createEditorCommands(deps: CommandDeps) {
    const { editor, preview, layout, ui, t } = deps;
    const hasSystem = () => editor.system !== null;

    const list: Command[] = [
        // файл
        { id: COMMAND.new, label: () => t('file.new'), run: () => void deps.confirmDiscard().then((ok) => ok && editor.newProject()) },
        { id: COMMAND.open, label: () => t('commands.open'), shortcut: 'Mod+O', run: () => void deps.confirmDiscard().then((ok) => ok && deps.pickFile()) },
        { id: COMMAND.save, label: () => t('file.save'), shortcut: 'Mod+S', run: () => void editor.saveProject() },
        { id: COMMAND.export, label: () => t('commands.exportJson'), shortcut: 'Mod+E', run: () => downloadText(FILE_NAME, editor.exportText()) },
        // правка
        ...historyCommands({ canUndo: () => editor.canUndo, canRedo: () => editor.canRedo, undo: () => editor.undo(), redo: () => editor.redo() }, { labels: { undo: () => t('history.undo'), redo: () => t('history.redo') } }),
        // вид
        { id: COMMAND.viewPreview, label: () => t('shell.preview'), shortcut: 'Alt+1', group: 'view', checked: () => layout.view === 'preview', run: () => (layout.view = 'preview') },
        { id: COMMAND.viewGraph, label: () => t('shell.graph'), shortcut: 'Alt+2', group: 'view', checked: () => layout.view === 'graph', run: () => (layout.view = 'graph') },
        { id: COMMAND.viewFit, label: () => t('shell.graphFit'), shortcut: 'Shift+1', enabled: () => layout.view === 'graph', run: () => editor.fitView() },
        { id: COMMAND.overdraw, label: () => t('budget.overdraw'), enabled: hasSystem, checked: () => preview.overdraw, run: () => (preview.overdraw = !preview.overdraw) },
        { id: COMMAND.environment, label: () => t('preview.environment'), enabled: hasSystem, checked: () => preview.environment, run: () => (preview.environment = !preview.environment) },
        // эффект
        { id: COMMAND.fxEnable, label: () => t('particles.enable'), enabled: () => !hasSystem(), run: () => editor.enableParticles() },
        { id: COMMAND.fxDisable, label: () => t('particles.disable'), enabled: hasSystem, run: () => editor.disableParticles() },
        {
            id: COMMAND.fxSample,
            label: () => t('particles.start'),
            run: async () => {
                editor.startParticles();
                await nextTick();
                if (editor.takeFitRequest()) editor.fitView();
            },
        },
        { id: COMMAND.fxPlay, label: () => t('commands.playPause'), enabled: hasSystem, run: () => editor.setPlaying(!editor.playback.playing) },
        // палитра
        { id: COMMAND.palette, label: () => t('commands.palette'), shortcut: 'Mod+K', run: () => (ui.paletteOpen = true) },
        // язык
        ...deps.languages.map(
            ({ code, name }): Command => ({ id: langId(code), label: () => name, group: 'lang', checked: () => deps.locale() === code, run: () => deps.setLocale(code) }),
        ),
    ];

    const commands = createCommands(list);

    /** Раскладка меню: она же порядок и группы в палитре. */
    const layoutOfMenu = (): MenuLayout => [
        { id: 'menu.file', label: () => t('commands.file'), items: [COMMAND.new, COMMAND.open, COMMAND.save, '-', COMMAND.export] },
        { id: 'menu.edit', label: () => t('commands.edit'), items: [COMMAND.undo, COMMAND.redo] },
        {
            id: 'menu.view',
            label: () => t('commands.view'),
            items: [
                COMMAND.viewPreview,
                COMMAND.viewGraph,
                COMMAND.viewFit,
                '-',
                COMMAND.overdraw,
                COMMAND.environment,
                '-',
                { id: 'menu.language', label: () => t('commands.language'), items: deps.languages.map((l) => langId(l.code)) },
                '-',
                COMMAND.palette,
            ],
        },
        { id: 'menu.effect', label: () => t('commands.effect'), items: [COMMAND.fxEnable, COMMAND.fxDisable, '-', COMMAND.fxSample, COMMAND.fxPlay] },
    ];

    /** Дерево для `TaoMenubar`. Звать внутри `computed`: подписи, «доступно» и «отмечено» читаются в момент вызова. */
    const menu = (): CommandMenuItem[] => commands.toMenu(layoutOfMenu());

    /** Команды для палитры: в порядке меню, под названием меню, в которое они входят. */
    const paletteItems = (): TaoCommandItem[] => {
        const items: TaoCommandItem[] = [];
        const seen = new Set<string>();
        const add = (id: string, group: string) => {
            if (seen.has(id) || !commands.has(id)) return;
            seen.add(id);
            const shortcut = commands.shortcutLabel(id);
            items.push({ id, label: commands.label(id)!, group, ...(shortcut ? { shortcut } : {}), disabled: !commands.isEnabled(id) });
        };
        const walk = (entries: MenuLayout, group: string) => {
            for (const entry of entries) {
                if (typeof entry === 'string') add(entry, group);
                else if ('items' in entry) walk(entry.items, group);
            }
        };
        for (const top of layoutOfMenu()) {
            if (typeof top === 'object' && 'items' in top) walk(top.items, typeof top.label === 'function' ? top.label() : top.label);
        }
        commands.list().forEach((c) => add(c.id, ''));
        return items;
    };

    return { commands, menu, paletteItems };
}

export type EditorCommands = ReturnType<typeof createEditorCommands>;
