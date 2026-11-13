import { reactive, type Ref } from 'vue';
import { guessBackground } from '@/flipbook/background';
import type { RGB } from '@/flipbook/color';
import type { BackgroundKey } from '@/flipbook/flipbook';
import type { ImageLike } from '@/flipbook/types';
import { autoDetect, backgroundOf, defaultKey, type Detect, type FlipbookBody, framesFor } from '@/flipbook/model';
import { imagePixels } from './flipbookImage';
import { useEditor } from './store';

/** Состояние окна флипбука вне документа (не сохраняется): играет ли анимация, какой кадр показан, берётся ли цвет с картинки. */
export const flipbookUi = reactive({ playing: true, frame: 0, picking: false });

/**
 * Правки флипбука на экране. Кадры зависят от пикселей картинки, поэтому смена картинки или способа поиска пересчитывает их
 * и пишется одной записью истории вместе с настройками: отмена возвращает и то, и другое.
 */
export function useFlipbookActions(pixels: Ref<ImageLike | null>) {
    const editor = useEditor();

    const body = (): FlipbookBody => editor.flipbook!;
    const patch = (change: Partial<FlipbookBody>, key?: string) => {
        if (editor.activeFlipbookId !== null) editor.updateFlipbook(editor.activeFlipbookId, change, key);
    };

    /** Новые настройки поиска кадров; кадры пересчитываются, если картинка разобрана. */
    function setDetect(detect: Detect, key = 'detect') {
        patch({ detect, frames: pixels.value ? framesFor(detect, pixels.value) : body().frames }, key);
    }

    /** Другая картинка: кадры ищутся на ней теми же настройками. Пусто: картинка убрана. */
    async function setImage(imageId: string) {
        const image = imageId ? await imagePixels(imageId) : null;
        const detect = body().detect;
        patch({ image: image ? imageId : '', frames: image ? framesFor(detect, image) : [] });
        flipbookUi.frame = 0;
    }

    /** Способ поиска кадров: сетка (столбцов по числу найденных кадров) или по цвету фона (цвет ключа, а нет его, цвет листа). */
    function setMode(mode: Detect['mode']) {
        const current = body();
        if (current.detect.mode === mode) return;
        if (mode === 'grid') setDetect({ mode: 'grid', cols: Math.max(1, current.frames.length), rows: 1 });
        else setDetect(autoDetect(current.key?.color ?? (pixels.value ? backgroundOf(pixels.value) : [0, 0, 0])));
    }

    /** Цвет фона: и поиск кадров по нему, и вырез в альфу берут один цвет, чтобы они не расходились. */
    function setBackground(color: RGB) {
        const current = body();
        const key = current.key ? { ...current.key, color } : null;
        const detect = current.detect.mode === 'auto' ? { ...current.detect, color } : current.detect;
        patch({ detect, frames: pixels.value ? framesFor(detect, pixels.value) : current.frames, key }, 'background');
    }

    function setKey(key: BackgroundKey | null, historyKey?: string) {
        patch({ key }, historyKey ?? 'key');
    }

    /** Включить или выключить вырез фона; включённый берёт цвет поиска по фону или цвет листа. */
    function toggleKey(on: boolean) {
        const current = body();
        if (!on) return setKey(null, 'keyToggle');
        const color = current.detect.mode === 'auto' ? current.detect.color : pixels.value ? backgroundOf(pixels.value) : ([0, 0, 0] as RGB);
        setKey(defaultKey(color), 'keyToggle');
    }

    /** Цвет пикселя картинки; undefined: за пределами. */
    function colorAt(x: number, y: number): RGB | undefined {
        const image = pixels.value;
        if (!image || x < 0 || y < 0 || x >= image.width || y >= image.height) return undefined;
        const i = (Math.floor(y) * image.width + Math.floor(x)) * 4;
        return [image.data[i]!, image.data[i + 1]!, image.data[i + 2]!];
    }

    /** Щелчок по картинке в режиме выбора цвета: этот цвет становится фоном, и режим выключается. */
    function pickAt(x: number, y: number) {
        const color = colorAt(Math.floor(x), Math.floor(y));
        flipbookUi.picking = false;
        if (!color) return;
        if (body().detect.mode !== 'auto') setMode('auto');
        setBackground(color);
    }

    return { setDetect, setImage, setMode, setBackground, setKey, toggleKey, pickAt, patch };
}

/**
 * Новый флипбук на картинке проекта. Если фон листа одного точного цвета (прозрачный или плоская заливка), кадры сразу
 * ищутся по нему и фон вырезается; иначе (JPEG с шумом) один кадр на всю картинку, а как резать, выбирает пользователь.
 */
export async function createFlipbookFromImage(imageId: string): Promise<string | null> {
    const editor = useEditor();
    const image = await imagePixels(imageId);
    if (!image) return editor.createFlipbook({ image: imageId });
    const color = guessBackground(image);
    const detect: Detect = color ? autoDetect(color) : { mode: 'grid', cols: 1, rows: 1 };
    return editor.createFlipbook({ image: imageId, detect, frames: framesFor(detect, image), key: color ? defaultKey(color) : null });
}
