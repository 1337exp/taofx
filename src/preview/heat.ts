// Остановки тепловой карты вынесены отдельно от рендерера: легенду рисует интерфейс, а он не должен тянуть за собой three.

/** Тепловая карта перекрытий: сколько слоёв частиц закрашивает пиксель → цвет. Те же остановки рисует легенда в интерфейсе. */
export const HEAT_STOPS: readonly { layers: number; color: string }[] = [
    { layers: 1, color: '#3b3bb0' },
    { layers: 2, color: '#2a7fff' },
    { layers: 4, color: '#25d4d4' },
    { layers: 6, color: '#3fd45a' },
    { layers: 8, color: '#e8e030' },
    { layers: 12, color: '#ff7a1a' },
    { layers: 16, color: '#ff2a2a' },
    { layers: 24, color: '#ffffff' },
];
