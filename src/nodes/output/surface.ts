import { defineNode } from '@/graph/registry';

/** Точка, в которую сходится граф: цвет и непрозрачность поверхности. Сама ничего не строит, её входы читает компилятор. */
export default defineNode({
    id: 'output/surface',
    title: 'Surface',
    inputs: { color: { type: 'color', default: [1, 1, 1] }, opacity: { type: 'float', default: 1 } },
    outputs: {},
    build: () => ({}),
});
