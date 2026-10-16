import { reactive, watch } from 'vue';

const KEY = 'taofx.layout';

interface Layout {
    /** Ноды видны; свёрнутая панель оставляет превью на всю ширину. */
    nodesOpen: boolean;
    /** Доля ширины под ноды, %: запоминается, чтобы разворот возвращал прежний размер. */
    nodesSize: number;
}

function load(): Layout {
    const fallback: Layout = { nodesOpen: true, nodesSize: 62 };
    try {
        const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Layout> | null;
        if (!raw) return fallback;
        return {
            nodesOpen: typeof raw.nodesOpen === 'boolean' ? raw.nodesOpen : fallback.nodesOpen,
            nodesSize: typeof raw.nodesSize === 'number' && raw.nodesSize >= 10 && raw.nodesSize <= 90 ? raw.nodesSize : fallback.nodesSize,
        };
    } catch {
        return fallback;
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
