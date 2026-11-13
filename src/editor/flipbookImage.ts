import { computed, onBeforeUnmount, ref, shallowRef, watch, type Ref } from 'vue';
import type { ImageLike } from '@/flipbook/types';
import { extname } from '@/project/paths';
import { MIME_BY_EXT } from './projectFile';
import { useEditor } from './store';

/**
 * Пиксели картинки ровно такими, какие лежат в файле: без управления цветом и без домножения на альфу (JPEG с шумом фона и
 * прозрачный PNG должны читаться теми же числами, по которым ядро ищет кадры и вырезает фон).
 */
export async function decodeImage(bytes: Uint8Array, mime: string): Promise<ImageLike> {
    const bitmap = await createImageBitmap(new Blob([bytes as BlobPart], { type: mime }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    try {
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bitmap, 0, 0);
        const { width, height, data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
        return { width, height, data };
    } finally {
        bitmap.close();
    }
}

/** Разобранное по байтам файла: поменялась картинка (другие байты), и разбор забыт сам. */
const decoded = new WeakMap<Uint8Array, Promise<ImageLike>>();

/** Картинка проекта по id в виде пикселей; null: нет такой картинки или её не разобрать. */
export async function imagePixels(imageId: string): Promise<ImageLike | null> {
    const editor = useEditor();
    const resource = editor.project.find(imageId);
    if (!resource || resource.kind !== 'image') return null;
    const bytes = editor.project.files.read(resource.path);
    const mime = MIME_BY_EXT[extname(resource.path).toLowerCase()];
    if (!bytes || !mime) return null;
    let promise = decoded.get(bytes);
    if (!promise) decoded.set(bytes, (promise = decodeImage(bytes, mime)));
    try {
        return await promise;
    } catch {
        decoded.delete(bytes);
        return null;
    }
}

/**
 * Картинка флипбука для показа: пиксели (для поиска кадров и запекания) и временный адрес (для `<img>`).
 * Следит за id и за проектом: удалили картинку, и обе пропадают.
 */
export function useFlipbookImage(imageId: Readonly<Ref<string>>) {
    const editor = useEditor();
    const pixels = shallowRef<ImageLike | null>(null);
    const url = ref('');
    let token = 0;

    const revoke = () => {
        if (url.value) URL.revokeObjectURL(url.value);
        url.value = '';
    };

    async function load() {
        const mine = ++token;
        void editor.projectRevision;
        const resource = imageId.value ? editor.project.find(imageId.value) : undefined;
        const bytes = resource?.kind === 'image' ? editor.project.files.read(resource.path) : undefined;
        const mime = resource ? MIME_BY_EXT[extname(resource.path).toLowerCase()] : undefined;
        if (!bytes || !mime) {
            revoke();
            pixels.value = null;
            return;
        }
        const next = await imagePixels(imageId.value);
        if (mine !== token) return; // за это время выбрали другую картинку
        revoke();
        pixels.value = next;
        if (next) url.value = URL.createObjectURL(new Blob([bytes as BlobPart], { type: mime }));
    }

    // перечитывается, когда сменилась картинка или её файл (путь меняется при переименовании, байты при замене)
    const key = computed(() => {
        void editor.projectRevision;
        const resource = imageId.value ? editor.project.find(imageId.value) : undefined;
        return resource ? `${resource.path}:${editor.project.files.read(resource.path)?.length ?? 0}` : '';
    });
    watch([imageId, key], load, { immediate: true });
    onBeforeUnmount(() => {
        token++;
        revoke();
    });

    return { pixels, url };
}
