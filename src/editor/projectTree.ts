import type { Resource } from '@/project/project';

/** Узел дерева проекта в виде, который принимает `TaoTree`. */
export interface ProjectTreeNode {
    id: string;
    label: string;
    icon?: string;
    children?: ProjectTreeNode[];
}

interface Dir {
    dirs: Map<string, Dir>;
    files: Resource[];
}

const byLabel = (a: ProjectTreeNode, b: ProjectTreeNode) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);

/** Id узла-папки: не совпадает с id ресурса (у того короткий случайный). */
export const folderId = (path: string) => `dir:${path}`;

/**
 * Дерево ресурсов проекта по их путям: папки первыми, потом файлы, внутри по имени. Лист это ресурс (id ресурса), папка
 * выводится из путей (пустых папок в проекте нет). Записи `.meta.json` не показываются: это часть ассета.
 */
export function buildProjectTree(resources: readonly Resource[]): ProjectTreeNode[] {
    const root: Dir = { dirs: new Map(), files: [] };
    for (const r of resources) {
        const parts = r.path.split('/');
        let dir = root;
        for (const part of parts.slice(0, -1)) {
            let next = dir.dirs.get(part);
            if (!next) dir.dirs.set(part, (next = { dirs: new Map(), files: [] }));
            dir = next;
        }
        dir.files.push(r);
    }

    const convert = (dir: Dir, base: string): ProjectTreeNode[] => [
        ...[...dir.dirs.entries()]
            .map(([name, child]): ProjectTreeNode => ({ id: folderId(base + name), label: name, children: convert(child, `${base}${name}/`) }))
            .sort(byLabel),
        ...dir.files
            .map((r): ProjectTreeNode => ({ id: r.id, label: r.path.slice(r.path.lastIndexOf('/') + 1), ...(r.kind === 'image' ? { icon: 'tao-image' } : {}) }))
            .sort(byLabel),
    ];
    return convert(root, '');
}
