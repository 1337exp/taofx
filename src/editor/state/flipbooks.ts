import { History } from '@1337exp/taoux/history';
import { computed, ref, type Ref, type ShallowRef } from 'vue';
import { readBody, type FlipbookBody } from '@/flipbook/model';
import type { Body } from '@/project/kinds';
import type { Project } from '@/project/project';
import type { Tabs } from './tabs';

export interface FlipbooksDeps {
    project: ShallowRef<Project>;
    projectRevision: Ref<number>;
    tabs: Tabs;
}

/** Документ «флипбук» открыт на вкладке `id`, и что его тело можно читать. */
const isFlipbook = (project: Project, id: string) => project.find(id)?.kind === 'flipbook';

/**
 * Редактор флипбуков. Остальные документы проходят через живой документ редактора (граф и система частиц), а у флипбука
 * тела нет нигде, кроме файла проекта: правка пишется прямо туда, а у каждого открытого флипбука своя история
 * (снимки тела, `History` из TaoUX). Активный флипбук показывается вместо сцены; живой документ при этом лежит как был.
 */
export function useFlipbooks(deps: FlipbooksDeps) {
    /** Флипбук, который сейчас на экране; null: на экране живой документ. */
    const activeId = ref<string | null>(null);
    const histories = new Map<string, History>();
    /** Растёт с каждой правкой и сменой: историю читают мимо реактивности. */
    const revision = ref(0);

    const text = (body: FlipbookBody) => JSON.stringify(body);

    /** Тело флипбука (со значениями по умолчанию); undefined: такого документа нет. */
    function bodyOf(id: string): FlipbookBody | undefined {
        void deps.projectRevision.value;
        const read = deps.project.value.readDoc(id);
        return read && read.resource.kind === 'flipbook' ? readBody(read.body) : undefined;
    }

    /** Выводит флипбук на экран. Вкладка добавляется (предпросмотром или закреплённой). false: это не флипбук. */
    function activate(id: string, preview = false): boolean {
        const body = bodyOf(id);
        if (!body) return false;
        deps.tabs.add(id, preview);
        if (!histories.has(id)) histories.set(id, new History(text(body)));
        activeId.value = id;
        revision.value++;
        return true;
    }

    /** На экран возвращается живой документ. История флипбука остаётся, пока жива его вкладка. */
    function deactivate() {
        if (activeId.value === null) return;
        activeId.value = null;
        revision.value++;
    }

    /** Вкладка флипбука закрыта: история забывается, а если он был на экране, экран свободен. */
    function forget(id: string) {
        histories.delete(id);
        if (activeId.value === id) activeId.value = null;
        revision.value++;
    }

    /**
     * Правка: поля `patch` заменяют поля тела, тело записывается в проект. Вкладка закрепляется (флипбук, который правят, не
     * должен исчезнуть при следующем предпросмотре). `key` склеивает подряд идущие правки одного поля в одну запись истории.
     * Возвращает false, если флипбука нет или тело не годится (тогда ничего не записано).
     */
    function update(id: string, patch: Partial<FlipbookBody>, key?: string): boolean {
        const current = bodyOf(id);
        if (!current) return false;
        const next: FlipbookBody = { ...current, ...patch };
        return write(id, next, (history) => history.commit(text(next), key), true);
    }

    function write(id: string, body: FlipbookBody, record: (history: History) => unknown, pin: boolean): boolean {
        try {
            deps.project.value.writeDoc(id, { ...body } as unknown as Body);
        } catch {
            return false;
        }
        const history = histories.get(id) ?? new History(text(body));
        histories.set(id, history);
        record(history);
        if (pin) deps.tabs.pin(id);
        deps.projectRevision.value++;
        revision.value++;
        return true;
    }

    function step(move: (history: History) => string | null) {
        const id = activeId.value;
        const history = id === null ? undefined : histories.get(id);
        const state = history && move(history);
        if (id === null || state === null || state === undefined) return;
        write(id, readBody(JSON.parse(state) as Record<string, unknown>), () => {}, false);
    }

    const undo = () => step((h) => h.undo());
    const redo = () => step((h) => h.redo());

    const active = computed(() => (activeId.value === null ? null : bodyOf(activeId.value) ?? null));
    const canUndo = computed(() => (void revision.value, activeId.value !== null && (histories.get(activeId.value)?.canUndo ?? false)));
    const canRedo = computed(() => (void revision.value, activeId.value !== null && (histories.get(activeId.value)?.canRedo ?? false)));

    return { activeId, active, bodyOf, activate, deactivate, forget, update, undo, redo, canUndo, canRedo, isFlipbook: (id: string) => isFlipbook(deps.project.value, id) };
}

export type Flipbooks = ReturnType<typeof useFlipbooks>;
