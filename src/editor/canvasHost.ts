import type { CanvasHost, CanvasOptions } from '@1337exp/taoux/canvas';
import type { PinTarget, useEditor } from './store';

type Editor = ReturnType<typeof useEditor>;

/** Мост между общим холстом (taoux/canvas) и стором графа эффекта: холст разбирает жесты, стор решает, что они значат. */
export function fxCanvasHost(editor: Editor): CanvasHost<PinTarget> {
    return {
        get camera() {
            return editor.camera;
        },
        setCamera: (camera) => {
            editor.camera = camera;
        },
        setViewport: (size) => {
            editor.viewport = size;
        },

        get selection() {
            return editor.selection;
        },
        setSelection: (ids) => editor.setSelection(ids),
        toggleSelected: (id) => editor.toggleSelected(id),
        selectConnection: (id) => editor.selectConnection(id),

        // Привязки к сетке и контейнеров нет: сдвиг простой, захватывать нечего.
        beginDrag: () => {},
        moveSelected: (dx, dy) => editor.moveSelected(dx, dy),
        endDrag: () => {},

        commit: () => editor.commit(),
        undo: () => editor.undo(),
        redo: () => editor.redo(),
        removeSelected: () => editor.removeSelected(),

        get paletteOpen() {
            return editor.palette !== null;
        },
        openPalette: (screen, world, origin) => editor.openPalette(screen, world, origin),
        closePalette: () => editor.closePalette(),

        connect: {
            get origin() {
                return editor.pending?.origin ?? null;
            },
            start: (pin, cursor) => editor.startConnect(pin, cursor),
            update: (cursor, target) => editor.updateConnect(cursor, target),
            finish: (target) => editor.finishConnect(target),
            cancel: () => editor.cancelConnect(),
        },
    };
}

/** Пин под указателем: кружок в строке ноды (`data-pin` с именем, `data-dir` с направлением). */
export const fxCanvasOptions: CanvasOptions<PinTarget> = {
    pinAt(target) {
        const pin = (target as Element | null)?.closest<HTMLElement>('[data-pin]');
        const nodeId = pin?.closest<HTMLElement>('[data-node-id]')?.dataset.nodeId;
        if (!pin || !nodeId) return null;
        return { ref: { node: nodeId, pin: pin.dataset.pin! }, dir: pin.dataset.dir as 'in' | 'out' };
    },
};
