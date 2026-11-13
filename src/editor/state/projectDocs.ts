import { MAX_FILE_BYTES, readBytesFile } from '@1337exp/taoux/file';
import type { Ref, ShallowRef } from 'vue';
import type { Registry } from '@/graph/registry';
import type { SavedView } from '@/graph/types';
import type { MessageKey } from '@/i18n';
import { ProjectError, type Project, type Resource } from '@/project/project';
import { extname, join, stem, uniquePath } from '@/project/paths';
import { emptyDoc, parseDoc, type EditorDoc } from '../doc';
import type { Tabs } from './tabs';
import { assetNameOf, emptyLink, loadProjectDoc, newDocument, renamedPath, saveProjectDoc, type ProjectLink } from '../projectFile';

/** От чего зависят операции: хранилища и то, как документ подменяется в редакторе. */
export interface ProjectDocsDeps {
    registry: Registry;
    project: ShallowRef<Project>;
    getLink(): ProjectLink;
    setLink(link: ProjectLink): void;
    /** Документ и камера в том виде, как они сейчас в редакторе. */
    current(): { doc: EditorDoc; view: SavedView };
    /** Открытый документ это ещё не тронутая заготовка (демо при запуске, пустой после «Новый проект»): в проект её не пишем. */
    isPristine(): boolean;
    /** Подменяет документ редактора целиком; история сбрасывается (её вернёт вкладка документа, если он уже был открыт). */
    show(doc: EditorDoc, view?: SavedView): void;
    /** Вкладки открытых документов: у каждого своя история, камера, вид и время. */
    tabs: Tabs;
    /** Документ вернулся на экран со своей камерой: подбирать её по размеру холста уже не нужно. */
    keepCamera(): void;
    openDocId: Ref<string | null>;
    projectRevision: Ref<number>;
    notify(kind: 'info' | 'error', key: MessageKey, args?: (string | number)[]): void;
}

export type RenameResult = 'ok' | 'unchanged' | 'invalid' | 'taken' | 'missing';
export type DeleteResult = { ok: true } | { ok: false; referrers: Resource[] } | { ok: false; referrers?: undefined; missing: true };

/**
 * Документы проекта: редактор по-прежнему правит один документ, а остальные лежат в файлах проекта. Здесь переходы между
 * ними (перед уходом открытый документ записывается в проект), создание, переименование, удаление и импорт файлов.
 */
export function useProjectDocs(deps: ProjectDocsDeps) {
    const { project } = deps;

    /** Дерево и открытый документ следят за проектом по счётчику: файлы меняются мимо реактивности. */
    function touch() {
        deps.openDocId.value = deps.getLink().docId;
        deps.projectRevision.value++;
    }

    /** Записывает открытый документ в проект (создаёт файл, если его ещё нет). Без правок файлы не меняются. */
    function sync() {
        if (deps.isPristine()) return; // нетронутая заготовка не становится файлом проекта сама собой
        const { doc, view } = deps.current();
        const link = saveProjectDoc(project.value, doc, view, deps.getLink(), project.value.manifest.name);
        deps.setLink(link);
        if (link.docId !== null && !deps.tabs.has(link.docId)) deps.tabs.add(link.docId); // документ получил файл: у него появляется вкладка (черновик был без неё); у уже открытой предпросмотр не снимается
        touch();
    }

    function showLoaded(id: string | undefined, preview = false): boolean {
        const loaded = loadProjectDoc(project.value, deps.registry, id);
        if (!loaded.ok) {
            deps.notify('error', `file.error.${loaded.error.code}` as MessageKey, loaded.error.detail === undefined ? undefined : [loaded.error.detail]);
            return false;
        }
        const { doc, view, link, dropped, missingAssets } = loaded.loaded;
        deps.setLink(link);
        deps.show(doc, view);
        if (link.docId !== null && deps.tabs.arrive(link.docId, preview)) deps.keepCamera();
        touch();
        if (dropped + missingAssets > 0) deps.notify('error', 'file.loadedWithProblems', [Object.keys(doc.graph.nodes).length, dropped + missingAssets]);
        return true;
    }

    /**
     * Открывает документ проекта в редакторе. Уже открытый остаётся как есть (а закреплённое открытие закрепляет его вкладку).
     * `preview`: вкладка-предпросмотр, её место займёт следующий предпросмотр.
     */
    function openDocument(id: string, preview = false): boolean {
        if (deps.getLink().docId === id) {
            if (!preview) deps.tabs.pin(id);
            return true;
        }
        sync();
        deps.tabs.leave(deps.getLink().docId);
        return showLoaded(id, preview);
    }

    /** Показывает пустой документ без файла (закрыта последняя вкладка, удалён последний документ). */
    function showEmpty() {
        deps.setLink(emptyLink());
        deps.show(emptyDoc(), { x: 0, y: 0, z: 1 });
        touch();
    }

    /** Закрывает вкладку: документ остаётся в проекте. Закрытая открытая вкладка отдаёт экран соседней, а последняя пустому документу. */
    function closeTab(id: string) {
        if (deps.getLink().docId !== id) {
            deps.tabs.remove(id);
            return;
        }
        sync();
        const next = deps.tabs.neighbour(id);
        deps.tabs.remove(id);
        if (!(next !== null && showLoaded(next))) showEmpty();
    }

    /** Оставляет открытой только эту вкладку. */
    function closeOtherTabs(id: string) {
        if (!openDocument(id)) return;
        for (const tab of [...deps.tabs.tabs.value]) if (tab.docId !== id) deps.tabs.remove(tab.docId);
    }

    /** Закрывает все вкладки. */
    function closeAllTabs() {
        sync();
        deps.tabs.reset();
        showEmpty();
    }

    /** Новый документ в проекте из заготовки; открывается сразу. */
    function createDocument(kind: 'effect' | 'material'): string | null {
        sync();
        deps.tabs.leave(deps.getLink().docId);
        const doc = newDocument(kind);
        const view = { x: 0, y: 0, z: 1 };
        const link = saveProjectDoc(project.value, doc, view, emptyLink(), '');
        deps.setLink(link);
        // Заготовка проходит тот же разбор, что и любой открываемый документ, и записывается уже в разобранном виде: иначе первая
        // смена документа переписала бы файл (разбор приводит поля к текущим) и проект стал бы «не сохранён» без правок.
        if (!showLoaded(link.docId ?? undefined)) deps.show(doc, view);
        sync();
        return link.docId;
    }

    /** Меняет имя файла ресурса; папка и расширение остаются, id и ссылки целы. */
    function renameResource(id: string, name: string): RenameResult {
        const resource = project.value.find(id);
        if (!resource) return 'missing';
        const to = renamedPath(resource, name);
        if (to === null) return 'invalid';
        if (to === resource.path) return 'unchanged';
        try {
            project.value.move(id, to);
        } catch (error) {
            if (error instanceof ProjectError && error.code === 'pathTaken') return 'taken';
            throw error;
        }
        touch();
        return 'ok';
    }

    /**
     * Удаляет ресурс. Если на него ссылаются, без `force` ничего не удаляется и возвращается список ссылающихся (интерфейс
     * спрашивает). Открытый документ перед этим записывается в проект, чтобы его ссылки были видны. Если удалён открытый
     * документ или тот, на чью картинку он ссылался, открытый документ поднимается заново из проекта.
     */
    function deleteResource(id: string, force = false): DeleteResult {
        sync();
        const resource = project.value.find(id);
        if (!resource) return { ok: false, missing: true };
        const removed = project.value.remove(id, { force });
        if (!removed.ok) return removed;
        const openId = deps.getLink().docId;
        const next = deps.tabs.neighbour(id); // соседняя вкладка займёт место закрытой
        deps.tabs.remove(id);
        if (openId === id) {
            // открытый документ удалён: берётся соседний по вкладкам, а нет такого, главный из оставшихся, а нет ни одного, пустой
            deps.setLink(emptyLink());
            // оставшийся не открылся (повреждён): показываем пустой документ, а не удалённый, чтобы он не воскрес при записи
            if (!(next !== null && showLoaded(next)) && !showLoaded(undefined)) deps.show(emptyDoc(), { x: 0, y: 0, z: 1 });
        } else if (openId !== null && removed.dangling.some((d) => d.id === openId)) {
            showLoaded(openId); // он ссылался на удалённую картинку: поднимается заново уже без неё
        }
        touch();
        return { ok: true };
    }

    /**
     * Добавляет в проект выбранные или брошенные файлы: картинки становятся ассетами (`textures/`), `.json` прежнего вида
     * документами (последний открывается). Остальное пропускается и считается.
     */
    async function importFiles(files: readonly (Blob & { name?: string })[]): Promise<{ images: number; documents: number; skipped: number }> {
        const p = project.value;
        sync();
        let images = 0;
        let documents = 0;
        let skipped = 0;
        let lastDoc: string | null = null;

        for (const file of files) {
            const name = file.name ?? '';
            const ext = extname(name).toLowerCase();
            const read = await readBytesFile(file);
            if (!read.ok) {
                skipped++;
                continue;
            }
            if (p.kinds.byExtension(ext)) {
                const path = uniquePath(join('textures', assetNameOf(name)), (candidate) => p.files.has(candidate) || p.files.has(candidate + '.meta.json'));
                p.addAsset(path, read.data);
                images++;
            } else if (ext === '.json' && read.data.length <= MAX_FILE_BYTES) {
                const parsed = parseDoc(new TextDecoder().decode(read.data), deps.registry);
                if (!parsed.ok) {
                    deps.notify('error', `file.error.${parsed.error.code}` as MessageKey, parsed.error.detail === undefined ? undefined : [parsed.error.detail]);
                    skipped++;
                    continue;
                }
                lastDoc = saveProjectDoc(p, parsed.doc, parsed.view, emptyLink(), stem(name) === 'taofx' ? '' : stem(name)).docId;
                documents++;
            } else {
                skipped++;
            }
        }
        touch();
        if (lastDoc) openDocument(lastDoc);
        if (images + documents > 0) deps.notify('info', 'project.imported', [images, documents]);
        if (skipped > 0) deps.notify(images + documents > 0 ? 'info' : 'error', 'project.importSkipped', [skipped]);
        return { images, documents, skipped };
    }

    /** Кто ссылается на ресурс (перед удалением; открытый документ предварительно записывается, чтобы его ссылки были видны). */
    function referrersOf(id: string): Resource[] {
        sync();
        return project.value.referrers(id);
    }

    return { sync, openDocument, createDocument, renameResource, deleteResource, importFiles, referrersOf, closeTab, closeOtherTabs, closeAllTabs };
}

export type ProjectDocs = ReturnType<typeof useProjectDocs>;
