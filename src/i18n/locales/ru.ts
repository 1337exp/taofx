/** Тексты интерфейса. `en.ts` обязан повторять структуру этого файла. */
export default {
    ui: {
        language: 'Язык',
    },
    file: {
        new: 'Новый',
        open: 'Открыть',
        save: 'Сохранить',
        newGraph: 'Новый граф',
        loaded: 'Открыто: нод — {0}',
        loadedWithDropped: 'Открыто: нод — {0}, недопустимых связей отброшено — {1}',
        error: {
            invalidJson: 'Файл не похож на JSON',
            notTaofxFile: 'Это не файл taofx',
            newerVersion: 'Файл создан более новой версией ({0})',
            invalidStructure: 'Файл повреждён: {0}',
            unknownNode: 'В файле неизвестная нода: {0}',
            tooLarge: 'Файл слишком большой',
            saveFailed: 'Не удалось сохранить в браузере: место закончилось или хранилище отключено',
            restoreFailed: 'Сохранённый граф не удалось прочитать: копия отложена, открыт демо-граф',
        },
    },
    history: {
        undo: 'Отменить',
        redo: 'Повторить',
    },
    view: {
        fit: 'Показать всё',
    },
    palette: {
        add: 'Добавить ноду',
        compatible: 'Нода для связи',
        search: 'Поиск…',
        empty: 'Ничего не найдено',
    },
    preview: {
        sphere: 'Сфера',
        plane: 'Плоскость',
        ok: 'Граф собран',
        errors: 'Ошибок: {0}',
    },
    nodeTexts: {
        nodes: {
            'input/time': { title: 'Время' },
            'input/uv': { title: 'UV' },
            'input/fresnel': { title: 'Френель', pins: { power: 'степень' } },
            'const/float': { title: 'Число', pins: { value: 'значение' } },
            'const/color': { title: 'Цвет', pins: { value: 'цвет', color: 'цвет' } },
            'math/add': { title: 'Сложение', pins: { result: 'результат' } },
            'math/multiply': { title: 'Умножение', pins: { result: 'результат' } },
            'math/mix': { title: 'Смешивание', pins: { result: 'результат' } },
            'math/sin': { title: 'Синус', pins: { result: 'результат' } },
            'math/smoothstep': { title: 'Сглаженная ступень', pins: { low: 'от', high: 'до', result: 'результат' } },
            'noise/perlin': { title: 'Шум Перлина', pins: { p: 'координата', n: 'шум' } },
            'output/surface': { title: 'Поверхность', pins: { color: 'цвет', opacity: 'непрозрачность' } },
        } as Record<string, { title?: string; pins?: Record<string, string> }>,
        categories: {
            input: 'Входные данные',
            const: 'Константы',
            math: 'Математика',
            noise: 'Шум',
            output: 'Выход',
        } as Record<string, string>,
    },
};
