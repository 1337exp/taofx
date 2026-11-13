// Пакет для игры из проекта: то, что кладут в игру. Редактор правит проект (`.taofx`), игре нужен файл эффекта в формате рантайма
// (`taofx` или `taofx-particles`) и картинки рядом, как обычные файлы. Рантайм про проект ничего не знает (docs/project.ru.md).
// Ядро без DOM: байты и тексты на входе и на выходе.

import { serialize } from '../graph/serialize';
import type { Graph } from '../graph/types';
import { serializeParticles } from '../particles/serialize';
import type { SystemDef } from '../particles/types';
import type { Project, Resource } from '../project/project';

export interface BundleFile {
    /** Путь внутри пакета: `имя.json` и картинки по их путям из проекта (`textures/лист.png`). */
    path: string;
    data: Uint8Array;
}

export interface BundleProblem {
    /** `missingAsset`: картинка, на которую ссылается документ, пропала из проекта (текстура убрана из пакета). */
    code: 'missingAsset';
    /** Имя текстуры графа. */
    detail: string;
}

export interface Bundle {
    /** Имя пакета: имя файла документа без папки и расширения. */
    name: string;
    /** Путь файла эффекта внутри пакета. */
    entry: string;
    files: BundleFile[];
    problems: BundleProblem[];
}

const nameOf = (resource: Resource): string => {
    const file = resource.path.slice(resource.path.lastIndexOf('/') + 1);
    return file.replace(/\.(fx|mat)\.json$/, '').replace(/\.json$/, '') || 'effect';
};

/**
 * Пакет для эффекта или материала проекта. Картинки документа (ссылки по id) кладутся в пакет файлами и подключаются путём от
 * файла эффекта; внешние адреса остаются как есть. Документ другого вида (флипбук) и неизвестный id дают undefined.
 */
export function buildBundle(project: Project, docId: string, options: { pretty?: boolean } = {}): Bundle | undefined {
    const doc = project.readDoc(docId);
    if (!doc || (doc.resource.kind !== 'effect' && doc.resource.kind !== 'material')) return undefined;
    const pretty = options.pretty ?? true;
    const graph = JSON.parse(JSON.stringify(doc.body.graph)) as Graph & { textures?: Record<string, { asset?: string; src?: string }> };

    const files: BundleFile[] = [];
    const problems: BundleProblem[] = [];
    const added = new Set<string>();
    for (const [name, texture] of Object.entries(graph.textures ?? {})) {
        if (texture.asset === undefined) continue; // внешний адрес: остаётся в графе как есть
        const asset = project.find(texture.asset);
        const data = asset ? project.files.read(asset.path) : undefined;
        if (!asset || !data) {
            delete graph.textures![name];
            problems.push({ code: 'missingAsset', detail: name });
            continue;
        }
        if (!added.has(asset.path)) {
            added.add(asset.path);
            files.push({ path: asset.path, data });
        }
        graph.textures![name] = { src: asset.path };
    }
    if (graph.textures && Object.keys(graph.textures).length === 0) delete graph.textures;

    const name = nameOf(doc.resource);
    const entry = `${name}.json`;
    const text = doc.resource.kind === 'effect' ? serializeParticles({ system: doc.body.system as SystemDef, material: graph }, pretty) : serialize(graph, undefined, pretty);
    return { name, entry, files: [{ path: entry, data: new TextEncoder().encode(text) }, ...files], problems };
}
