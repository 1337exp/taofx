// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive } from 'vue';
import { COMMAND, createEditorCommands, type CommandDeps } from '@/editor/commands';
import { DEFAULT_LAYOUT } from '@/editor/layout';
import { usePreviewState } from '@/editor/state/preview';
import { useEditor } from '@/editor/store';
import type { LocaleCode } from '@/i18n';

/** Подписи в тесте это сами ключи: проверяется, какие подписи просит реестр, а не их перевод. */
const t = ((key: string) => key) as CommandDeps['t'];

function setup(overrides: Partial<CommandDeps> = {}) {
    const editor = useEditor();
    const layout = reactive({ ...DEFAULT_LAYOUT });
    const ui = reactive({ paletteOpen: false, selectedResource: null as string | null, renameId: null as string | null });
    let locale: LocaleCode = 'ru';
    const confirmDiscard = vi.fn(async () => true);
    const pickFile = vi.fn();
    const setLocale = vi.fn((code: LocaleCode) => (locale = code));
    const deps: CommandDeps = {
        editor,
        preview: usePreviewState(),
        layout,
        ui,
        t,
        locale: () => locale,
        setLocale,
        languages: [
            { code: 'ru', name: 'Русский' },
            { code: 'en', name: 'English' },
        ],
        confirmDiscard,
        pickFile,
        pickFiles: vi.fn(),
        confirmDelete: vi.fn(async () => true),
        ...overrides,
    };
    return { ...createEditorCommands(deps), deps, editor, layout, ui, confirmDiscard, pickFile, setLocale };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const find = (items: ReturnType<ReturnType<typeof setup>['menu']>, id: string): any => {
    for (const item of items) {
        if ('id' in item && item.id === id) return item;
        if ('items' in item && item.items) {
            const inner = find(item.items, id);
            if (inner) return inner;
        }
    }
    return undefined;
};

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});
afterEach(() => vi.restoreAllMocks());

describe('реестр команд редактора', () => {
    it('сочетания не заняты браузером и не повторяются', () => {
        expect(setup().commands.check()).toEqual([]);
    });

    it('меню строится целиком (опечатка в id была бы ошибкой): файл, правка, вид с языками, эффект', () => {
        const { menu } = setup();
        const tree = menu();
        expect(tree.map((m: any) => m.label)).toEqual(['commands.file', 'commands.edit', 'commands.view', 'commands.effect']);
        expect(find(tree, 'menu.file').items.map((i: any) => i.id ?? i.type)).toEqual([COMMAND.new, COMMAND.open, COMMAND.save, 'separator', COMMAND.newEffect, COMMAND.newMaterial, COMMAND.newFlipbook, COMMAND.import, 'separator', COMMAND.tabClose, COMMAND.tabCloseOthers, COMMAND.tabCloseAll, 'separator', COMMAND.export]);
        expect(find(tree, 'menu.edit').items.map((i: any) => i.id ?? i.type)).toEqual([COMMAND.undo, COMMAND.redo, 'separator', COMMAND.resourceRename, COMMAND.resourceDelete]);
        expect(find(tree, 'menu.language').items.map((i: any) => i.label)).toEqual(['Русский', 'English']);
        expect(find(tree, 'menu.effect').items.map((i: any) => i.id ?? i.type)).toEqual([COMMAND.fxEnable, COMMAND.fxDisable, 'separator', COMMAND.fxSample, COMMAND.fxPlay]);
    });

    it('сочетания в подписях меню: сохранить Ctrl+S, палитра Ctrl+K', () => {
        const { commands, menu } = setup();
        expect(commands.shortcutLabel(COMMAND.save)).toBe('Ctrl+S');
        expect(find(menu(), COMMAND.palette).shortcut).toBe('Ctrl+K');
        expect(commands.shortcutLabel(COMMAND.new)).toBeUndefined();
    });
});

describe('доступность и отметки', () => {
    it('отмена и возврат доступны только когда есть что отменять и возвращать', () => {
        const { commands, editor } = setup();
        expect(commands.isEnabled(COMMAND.undo)).toBe(false);
        expect(commands.isEnabled(COMMAND.redo)).toBe(false);
        editor.setValue('mask', 'low', 0.3);
        expect(commands.isEnabled(COMMAND.undo)).toBe(true);
        commands.run(COMMAND.undo);
        expect(commands.isEnabled(COMMAND.undo)).toBe(false);
        expect(commands.isEnabled(COMMAND.redo)).toBe(true);
        commands.run(COMMAND.redo);
        expect(editor.graph.nodes.mask!.values.low).toBe(0.3);
    });

    it('вид: превью и граф это радио, «показать всё» только на графе', () => {
        const { commands, menu, layout } = setup();
        expect(find(menu(), COMMAND.viewPreview)).toMatchObject({ type: 'radio', checked: true });
        expect(find(menu(), COMMAND.viewGraph)).toMatchObject({ type: 'radio', checked: false });
        expect(commands.isEnabled(COMMAND.viewFit)).toBe(false);
        commands.run(COMMAND.viewGraph);
        expect(layout.view).toBe('graph');
        expect(find(menu(), COMMAND.viewGraph).checked).toBe(true);
        expect(commands.isEnabled(COMMAND.viewFit)).toBe(true);
        commands.run(COMMAND.viewPreview);
        expect(layout.view).toBe('preview');
    });

    it('«показать всё» подбирает камеру графа', () => {
        const { commands, editor, layout } = setup();
        layout.view = 'graph';
        editor.camera = { x: 9999, y: 9999, z: 0.2 };
        commands.run(COMMAND.viewFit);
        expect(editor.camera).not.toEqual({ x: 9999, y: 9999, z: 0.2 });
    });

    it('эффект: включить и выключить частицы взаимно исключают друг друга, перекрытия и окружение только у эффекта', () => {
        const { commands, editor, menu, deps } = setup();
        expect(commands.isEnabled(COMMAND.fxEnable)).toBe(true);
        for (const id of [COMMAND.fxDisable, COMMAND.fxPlay, COMMAND.overdraw, COMMAND.environment]) expect(commands.isEnabled(id), id).toBe(false);

        commands.run(COMMAND.fxEnable);
        expect(editor.system).not.toBeNull();
        expect(commands.isEnabled(COMMAND.fxEnable)).toBe(false);
        for (const id of [COMMAND.fxDisable, COMMAND.fxPlay, COMMAND.overdraw, COMMAND.environment]) expect(commands.isEnabled(id), id).toBe(true);

        commands.run(COMMAND.overdraw);
        expect(deps.preview.overdraw).toBe(true);
        expect(find(menu(), COMMAND.overdraw)).toMatchObject({ type: 'checkbox', checked: true });
        commands.run(COMMAND.overdraw); // переключатель: второй раз выключает
        expect(deps.preview.overdraw).toBe(false);
        commands.run(COMMAND.environment);
        expect(deps.preview.environment).toBe(true);
        commands.run(COMMAND.environment);
        expect(deps.preview.environment).toBe(false);

        commands.run(COMMAND.fxDisable);
        expect(editor.system).toBeNull();
    });

    it('играть или пауза переключает воспроизведение', () => {
        const { commands, editor } = setup();
        commands.run(COMMAND.fxEnable);
        const before = editor.playback.playing;
        commands.run(COMMAND.fxPlay);
        expect(editor.playback.playing).toBe(!before);
        commands.run(COMMAND.fxPlay);
        expect(editor.playback.playing).toBe(before);
    });

    it('недоступная команда не выполняется', () => {
        const { commands, editor } = setup();
        expect(commands.run(COMMAND.fxDisable)).toBe(false);
        expect(editor.system).toBeNull();
    });

    it('пример загружает систему частиц и подбирает камеру, если просили', async () => {
        const { commands, editor } = setup();
        const fit = vi.spyOn(editor, 'fitView');
        vi.spyOn(editor, 'takeFitRequest').mockReturnValueOnce(true).mockReturnValueOnce(false);
        commands.run(COMMAND.fxSample);
        await flush();
        expect(editor.system).not.toBeNull();
        expect(fit).toHaveBeenCalledTimes(1);
        commands.run(COMMAND.fxSample);
        await flush();
        expect(fit).toHaveBeenCalledTimes(1); // второй раз камеру не просили
    });
});

describe('файл', () => {
    it('«Новый» и «Открыть» спрашивают подтверждение: отказ ничего не меняет, согласие выполняет', async () => {
        const { commands, editor, confirmDiscard, pickFile } = setup();
        const newProject = vi.spyOn(editor, 'newProject');

        confirmDiscard.mockResolvedValueOnce(false);
        commands.run(COMMAND.new);
        await flush();
        expect(newProject).not.toHaveBeenCalled();
        commands.run(COMMAND.new);
        await flush();
        expect(newProject).toHaveBeenCalledOnce();

        confirmDiscard.mockResolvedValueOnce(false);
        commands.run(COMMAND.open);
        await flush();
        expect(pickFile).not.toHaveBeenCalled();
        commands.run(COMMAND.open);
        await flush();
        expect(pickFile).toHaveBeenCalledOnce();
    });

    it('«Сохранить» сохраняет проект', () => {
        const { commands, editor } = setup();
        const save = vi.spyOn(editor, 'saveProject').mockResolvedValue(true);
        commands.run(COMMAND.save);
        expect(save).toHaveBeenCalledOnce();
    });

    it('«Экспорт» отдаёт файл для игры', async () => {
        const names: string[] = [];
        vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:x');
        vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
            names.push(this.download);
        });
        setup().commands.run(COMMAND.export);
        expect(names).toEqual(['taofx.json']);
    });
});

describe('проект и ресурсы', () => {
    it('новый эффект и материал создают документы и открывают их; «Добавить файлы» просит выбор файлов', () => {
        const { commands, editor, deps } = setup();
        commands.run(COMMAND.newEffect);
        expect(editor.system).not.toBeNull();
        commands.run(COMMAND.newMaterial);
        expect(editor.system).toBeNull();
        expect(editor.project.resources.map((r) => r.kind).sort()).toEqual(['effect', 'material']);
        commands.run(COMMAND.import);
        expect(deps.pickFiles).toHaveBeenCalledOnce();
    });

    it('новый флипбук создаёт документ и выводит его на экран вместо сцены', () => {
        const { commands, editor } = setup();
        commands.run(COMMAND.newEffect);
        commands.run(COMMAND.newFlipbook);
        const flip = editor.project.resources.find((r) => r.kind === 'flipbook')!;
        expect(flip.path).toBe('flipbooks/flipbook.flip.json');
        expect(editor.activeFlipbookId).toBe(flip.id);
        expect(editor.system).not.toBeNull(); // сцена лежит как была
    });

    it('команды вкладок работают на том, что на экране, в том числе на флипбуке', () => {
        const { commands, editor } = setup();
        commands.run(COMMAND.newEffect);
        commands.run(COMMAND.newFlipbook);
        const flip = editor.activeFlipbookId!;
        expect(commands.isEnabled(COMMAND.tabClose)).toBe(true);
        expect(commands.isEnabled(COMMAND.tabCloseOthers)).toBe(true);
        commands.run(COMMAND.tabCloseOthers);
        expect(editor.tabs.map((t) => t.docId)).toEqual([flip]);
        commands.run(COMMAND.tabClose);
        expect(editor.tabs).toEqual([]);
        expect(editor.activeFlipbookId).toBeNull();
        expect(commands.isEnabled(COMMAND.tabClose)).toBe(false);
    });

    it('«Открыть» из дерева доступно и для флипбука; удаление открытого флипбука возвращает выбор на документ на экране', async () => {
        const { commands, editor, ui } = setup();
        commands.run(COMMAND.newEffect);
        const fx = editor.openDocId!;
        commands.run(COMMAND.newFlipbook);
        const flip = editor.activeFlipbookId!;
        ui.selectedResource = flip;
        expect(commands.isEnabled(COMMAND.resourceOpen)).toBe(true);
        editor.openDocument(fx);
        commands.run(COMMAND.resourceOpen);
        expect(editor.activeFlipbookId).toBe(flip);
        commands.run(COMMAND.resourceDelete);
        await vi.waitFor(() => expect(editor.project.find(flip)).toBeUndefined());
        expect(ui.selectedResource).toBe(fx);
    });

    it('команды над ресурсом доступны, только когда он выбран', () => {
        const { commands, editor, ui } = setup();
        for (const id of [COMMAND.resourceOpen, COMMAND.resourceRename, COMMAND.resourceDelete]) expect(commands.isEnabled(id), id).toBe(false);
        const id = editor.createDocument('effect')!;
        ui.selectedResource = id;
        for (const cmd of [COMMAND.resourceOpen, COMMAND.resourceRename, COMMAND.resourceDelete]) expect(commands.isEnabled(cmd), cmd).toBe(true);
        ui.selectedResource = 'нет';
        expect(commands.isEnabled(COMMAND.resourceRename)).toBe(false);
    });

    it('«Открыть» у картинки недоступно, у документа открывает его', async () => {
        const { commands, editor, ui } = setup();
        const a = editor.createDocument('effect')!;
        editor.createDocument('material');
        await editor.importFiles([new File([Uint8Array.of(1)], 'x.png')]);
        ui.selectedResource = editor.project.resources.find((r) => r.kind === 'image')!.id;
        expect(commands.isEnabled(COMMAND.resourceOpen)).toBe(false);
        ui.selectedResource = a;
        commands.run(COMMAND.resourceOpen);
        expect(editor.openDocId).toBe(a);
    });

    it('«Переименовать» открывает окно переименования для выбранного', () => {
        const { commands, editor, ui } = setup();
        ui.selectedResource = editor.createDocument('effect')!;
        commands.run(COMMAND.resourceRename);
        expect(ui.renameId).toBe(ui.selectedResource);
    });

    it('«Удалить» спрашивает с перечнем ссылающихся: отказ ничего не удаляет, согласие удаляет и снимает выбор', async () => {
        const confirmDelete = vi.fn(async () => false);
        const { commands, editor, ui } = setup({ confirmDelete });
        const keep = editor.createDocument('effect')!;
        const gone = editor.createDocument('material')!;
        ui.selectedResource = gone;
        commands.run(COMMAND.resourceDelete);
        await flush();
        expect(confirmDelete).toHaveBeenCalledOnce();
        expect((confirmDelete.mock.calls[0] as any)[0]).toMatchObject({ id: gone });
        expect((confirmDelete.mock.calls[0] as any)[1]).toEqual([]);
        expect(editor.project.find(gone)).toBeDefined();

        confirmDelete.mockResolvedValueOnce(true);
        commands.run(COMMAND.resourceDelete);
        await flush();
        expect(editor.project.find(gone)).toBeUndefined();
        expect(ui.selectedResource).toBe(keep);
        expect(editor.openDocId).toBe(keep);
    });

    it('при удалении картинки подтверждение получает ссылающихся, а согласие удаляет её', async () => {
        const confirmDelete = vi.fn(async () => true);
        const { commands, editor, ui } = setup({ confirmDelete });
        const legacy = JSON.parse(editor.exportText());
        legacy.graph.nodes.tex = { id: 'tex', type: 'input/texture', x: 0, y: 300, values: {}, params: { texture: 'sheet' } };
        legacy.graph.textures = { sheet: { src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==' } };
        await editor.openFile(new File([JSON.stringify(legacy)], 'with-texture.json'));
        editor.syncDocument();
        const image = editor.project.resources.find((r) => r.kind === 'image')!;
        const doc = editor.project.resources.find((r) => r.type === 'doc')!;

        ui.selectedResource = image.id;
        commands.run(COMMAND.resourceDelete);
        await flush();
        expect((confirmDelete.mock.calls[0] as any)[1].map((r: any) => r.id)).toEqual([doc.id]);
        expect(editor.project.find(image.id)).toBeUndefined();
    });

    it('брошенные в окно файлы: проект .taofx открывается после подтверждения, остальное идёт в проект', async () => {
        const { dropFiles, editor, confirmDiscard } = setup();
        const open = vi.spyOn(editor, 'openFile').mockResolvedValue();
        const importFiles = vi.spyOn(editor, 'importFiles');

        confirmDiscard.mockResolvedValueOnce(false);
        await dropFiles([new File([Uint8Array.of(1)], 'a.taofx'), new File([Uint8Array.of(2)], 'b.png')]);
        expect(open).not.toHaveBeenCalled();
        expect(importFiles).not.toHaveBeenCalled();

        await dropFiles([new File([Uint8Array.of(1)], 'A.TAOFX'), new File([Uint8Array.of(2)], 'b.png')]);
        expect(open).toHaveBeenCalledOnce();
        expect(importFiles).not.toHaveBeenCalled();

        await dropFiles([new File([Uint8Array.of(2)], 'b.png')]);
        expect(importFiles).toHaveBeenCalledOnce();
        expect(editor.project.resources.map((r) => r.path)).toEqual(['textures/b.png']);
    });
});

describe('вкладки', () => {
    it('закрыть вкладку, остальные и все: доступность и действие, Alt+W на клавиатуре', () => {
        const { commands, editor, deps } = setup();
        for (const id of [COMMAND.tabClose, COMMAND.tabCloseOthers, COMMAND.tabCloseAll]) expect(commands.isEnabled(id), id).toBe(false);
        const a = editor.createDocument('effect')!;
        expect(commands.isEnabled(COMMAND.tabClose)).toBe(true);
        expect(commands.isEnabled(COMMAND.tabCloseOthers)).toBe(false); // вкладка одна
        expect(commands.isEnabled(COMMAND.tabCloseAll)).toBe(true);
        const b = editor.createDocument('effect')!;
        expect(commands.isEnabled(COMMAND.tabCloseOthers)).toBe(true);

        commands.run(COMMAND.tabCloseOthers);
        expect(editor.tabs.map((t) => t.docId)).toEqual([b]);
        editor.openDocument(a);
        const off = commands.bind(window);
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', altKey: true, bubbles: true, cancelable: true }));
        expect(editor.openDocId).toBe(b);
        off();
        commands.run(COMMAND.tabCloseAll);
        expect(editor.tabs).toEqual([]);
        expect(deps.editor.openDocId).toBeNull();
    });
});

describe('палитра и язык', () => {
    it('команда палитры открывает палитру (повторный вызов её не закрывает)', () => {
        const { commands, ui } = setup();
        commands.run(COMMAND.palette);
        expect(ui.paletteOpen).toBe(true);
        commands.run(COMMAND.palette);
        expect(ui.paletteOpen).toBe(true);
    });

    it('язык это радио: отмечен текущий, выбор зовёт смену языка', () => {
        const { commands, menu, setLocale } = setup();
        expect(find(menu(), 'lang.ru')).toMatchObject({ type: 'radio', checked: true });
        expect(find(menu(), 'lang.en')).toMatchObject({ type: 'radio', checked: false });
        commands.run('lang.en');
        expect(setLocale).toHaveBeenCalledWith('en');
        expect(find(menu(), 'lang.en').checked).toBe(true);
    });

    it('палитра: команды в порядке меню, под названиями меню, с сочетаниями и признаком недоступности', () => {
        const { paletteItems } = setup();
        const items = paletteItems();
        const ids = items.map((i) => i.id);
        expect(ids.slice(0, 11)).toEqual([COMMAND.new, COMMAND.open, COMMAND.save, COMMAND.newEffect, COMMAND.newMaterial, COMMAND.newFlipbook, COMMAND.import, COMMAND.tabClose, COMMAND.tabCloseOthers, COMMAND.tabCloseAll, COMMAND.export]);
        expect(items.find((i) => i.id === COMMAND.save)).toMatchObject({ label: 'file.save', group: 'commands.file', shortcut: 'Ctrl+S', disabled: false });
        expect(items.find((i) => i.id === COMMAND.undo)).toMatchObject({ group: 'commands.edit', disabled: true });
        expect(items.find((i) => i.id === 'lang.en')).toMatchObject({ group: 'commands.view', label: 'English' });
        expect(items.find((i) => i.id === COMMAND.new)).not.toHaveProperty('shortcut');
        expect(new Set(ids).size).toBe(ids.length); // каждая команда один раз
    });

    it('в палитре есть вообще все команды реестра', () => {
        const { paletteItems, commands } = setup();
        expect(paletteItems().map((i) => i.id).sort()).toEqual(commands.list().map((c) => c.id).sort());
    });

    it('команда вне меню тоже попадает в палитру, в конец и без группы', () => {
        const { paletteItems, commands } = setup();
        commands.add({ id: 'extra', label: 'Extra', run: () => {} });
        const items = paletteItems();
        expect(items[items.length - 1]).toMatchObject({ id: 'extra', label: 'Extra', group: '' });
    });

    it('палитра следует за состоянием: после включения частиц «Выключить» становится доступной', () => {
        const { paletteItems, commands } = setup();
        const disabled = () => paletteItems().find((i) => i.id === COMMAND.fxDisable)!.disabled;
        expect(disabled()).toBe(true);
        commands.run(COMMAND.fxEnable);
        expect(disabled()).toBe(false);
    });
});

describe('клавиши', () => {
    const press = (init: KeyboardEventInit, target: EventTarget = window) => {
        const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init });
        target.dispatchEvent(event);
        return event;
    };

    it('Ctrl+S сохраняет, и страница не получает «Сохранить как»', () => {
        const { commands, editor } = setup();
        const save = vi.spyOn(editor, 'saveProject').mockResolvedValue(true);
        const off = commands.bind(window);
        const event = press({ key: 's', code: 'KeyS', ctrlKey: true });
        expect(save).toHaveBeenCalledOnce();
        expect(event.defaultPrevented).toBe(true);
        off();
    });

    it('Ctrl+K открывает палитру, на русской раскладке тоже (физическая клавиша)', () => {
        const { commands, ui } = setup();
        const off = commands.bind(window);
        press({ key: 'л', code: 'KeyK', ctrlKey: true });
        expect(ui.paletteOpen).toBe(true);
        off();
    });

    it('Alt+2 открывает граф, Alt+1 превью', () => {
        const { commands, layout } = setup();
        const off = commands.bind(window);
        press({ key: '2', code: 'Digit2', altKey: true });
        expect(layout.view).toBe('graph');
        press({ key: '1', code: 'Digit1', altKey: true });
        expect(layout.view).toBe('preview');
        off();
    });

    it('в поле ввода Ctrl+Z остаётся тексту, а не отменой документа', () => {
        const { commands, editor } = setup();
        editor.setValue('mask', 'low', 0.3);
        const undo = vi.spyOn(editor, 'undo');
        const off = commands.bind(window);
        const input = document.createElement('input');
        document.body.append(input);
        press({ key: 'z', code: 'KeyZ', ctrlKey: true }, input);
        expect(undo).not.toHaveBeenCalled();
        press({ key: 'z', code: 'KeyZ', ctrlKey: true });
        expect(undo).toHaveBeenCalledOnce();
        input.remove();
        off();
    });

    it('после bind-а возвращённая функция снимает клавиши', () => {
        const { commands, ui } = setup();
        const off = commands.bind(window);
        off();
        press({ key: 'k', code: 'KeyK', ctrlKey: true });
        expect(ui.paletteOpen).toBe(false);
    });
});
