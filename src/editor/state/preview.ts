import { defineStore } from 'pinia';
import { ref, shallowRef } from 'vue';
import type { BudgetReport } from '@/particles/budget';
import type { Shape } from '@/preview/preview';

/**
 * Что превью сообщает остальным областям оболочки и что они ему задают: рендерер, живые числа, бюджет, вид и отладка.
 * Само превью (`PreviewPanel`) владеет рендерером и частицами; нижняя панель, статус-строка и инспектор только читают.
 */
export const usePreviewState = defineStore('preview', () => {
    /** Имя рендерера, когда он поднялся (`WebGPU`, `WebGL`). */
    const backend = ref('…');
    const shape = ref<Shape>('sphere');
    const environment = ref(false);
    const overdraw = ref(false);
    /** Бюджет по всей длине системы; null: документ не система частиц или ещё не посчитан. */
    const budget = shallowRef<BudgetReport | null>(null);
    /** Живых частиц сейчас и мс симуляции (обновляется несколько раз в секунду). */
    const live = ref({ count: 0, simMs: 0 });

    return { backend, shape, environment, overdraw, budget, live };
});
