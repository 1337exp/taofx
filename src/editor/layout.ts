import { reactive, watch } from 'vue';

const KEY = 'taofx.layout';

export type CenterView = 'preview' | 'graph';
export type BottomTab = 'problems' | 'budget';

/**
 * Раскладка оболочки: размеры областей и выбранные виды. Это настройка интерфейса, не проект: хранится в браузере
 * (как язык), в файл проекта не идёт.
 */
export interface Layout {
    /** Доля ширины под левую колонку (проект и слои), %. */
    left: number;
    /** Доля центра в остатке справа от левой колонки (остальное инспектор), %. */
    center: number;
    /** Доля высоты под главный вид и таймлайн в центре (остальное нижняя панель), %. */
    stage: number;
    /** Доля высоты под «Проект» в левой колонке (остальное «Слои»), %. */
    leftStage: number;
    view: CenterView;
    bottomTab: BottomTab;
}

export const DEFAULT_LAYOUT: Layout = { left: 17, center: 74, stage: 72, leftStage: 62, view: 'preview', bottomTab: 'problems' };

const inRange = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;

/** Читает сохранённую раскладку: что негодно или забыто, берётся по умолчанию (старый формат с `nodesOpen` тоже сюда). */
export function readLayout(raw: unknown): Layout {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    const d = DEFAULT_LAYOUT;
    return {
        left: inRange(r.left, 8, 40) ? r.left : d.left,
        center: inRange(r.center, 30, 92) ? r.center : d.center,
        stage: inRange(r.stage, 25, 90) ? r.stage : d.stage,
        leftStage: inRange(r.leftStage, 15, 85) ? r.leftStage : d.leftStage,
        view: r.view === 'graph' || r.view === 'preview' ? r.view : d.view,
        bottomTab: r.bottomTab === 'budget' || r.bottomTab === 'problems' ? r.bottomTab : d.bottomTab,
    };
}

function load(): Layout {
    try {
        return readLayout(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
    } catch {
        return { ...DEFAULT_LAYOUT };
    }
}

export const layout = reactive(load());

watch(layout, () => {
    try {
        localStorage.setItem(KEY, JSON.stringify(layout));
    } catch {
        /* без хранилища раскладка просто не запоминается */
    }
});
