import { bakeSheet } from '@/flipbook/flipbook';
import { encodePng } from '@/flipbook/png';
import { join, uniquePath } from '@/project/paths';
import { imagePixels } from './flipbookImage';
import { renamableName, sameBytes } from './projectFile';
import { useEditor } from './store';

/** Какой запуск запекания последний у флипбука: устаревший, пока шёл, ничего не пишет. */
const latest = new Map<string, number>();
let counter = 0;

/**
 * Запекает флипбук в картинку проекта: лист с равными ячейками (то, что читает нода «Спрайт-лист»), PNG в `textures/имя.sheet.png`.
 * Материалы берут её как любую картинку проекта; повторное запекание переписывает те же байты под тем же id, а подключённые
 * к открытому документу текстуры обновляются. Возвращает id картинки или null (нет картинки-источника или кадров).
 */
export async function bakeFlipbook(flipbookId: string): Promise<string | null> {
    const editor = useEditor();
    const mine = ++counter;
    latest.set(flipbookId, mine);

    const body = editor.flipbookBody(flipbookId);
    const image = body?.image ? await imagePixels(body.image) : null;
    if (!body || !image || body.frames.length === 0) return null;
    const bytes = await encodePng(bakeSheet(image, body.frames, body.key ? { key: body.key } : {}));
    if (latest.get(flipbookId) !== mine) return null; // за это время флипбук запекли заново

    const project = editor.project;
    const resource = project.find(flipbookId);
    const current = editor.flipbookBody(flipbookId);
    if (!resource || !current) return null;

    let sheet = current.sheet ? project.find(current.sheet) : undefined;
    if (sheet?.kind !== 'image') sheet = undefined;
    if (sheet) {
        const old = project.files.read(sheet.path);
        if (old && sameBytes(old, bytes)) return sheet.id;
        project.files.write(sheet.path, bytes);
    } else {
        const path = uniquePath(join('textures', `${renamableName(resource)}.sheet.png`), (p) => project.files.has(p) || project.files.has(`${p}.meta.json`));
        sheet = project.addAsset(path, bytes);
        editor.setFlipbookSheet(flipbookId, sheet.id);
    }
    editor.refreshTextures();
    return sheet.id;
}
