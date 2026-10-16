// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useEditor, type PinTarget } from '@/editor/store';

const out = (node: string, pin: string): PinTarget => ({ ref: { node, pin }, dir: 'out' });
const inp = (node: string, pin: string): PinTarget => ({ ref: { node, pin }, dir: 'in' });

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

describe('протягивание связей', () => {
    it('создаёт допустимую связь и отклоняет недопустимую', () => {
        const editor = useEditor();
        const count = editor.graph.connections.length;

        // vec3 (смешивание) → opacity (float): сужение, нельзя
        editor.startConnect(out('body', 'result'), [0, 0]);
        expect(editor.finishConnect(inp('out', 'opacity'))).toBe(false);

        // из выхода в выход: нельзя
        editor.startConnect(out('time', 't'), [0, 0]);
        expect(editor.finishConnect(out('uv', 'uv'))).toBe(false);

        // float (время) → opacity: можно, и обратное направление (от входа к выходу) тоже
        editor.startConnect(inp('out', 'opacity'), [0, 0]);
        expect(editor.finishConnect(out('time', 't'))).toBe(true);
        expect(editor.graph.connections.length).toBe(count + 1);
    });

    it('валидность цели видна во время протягивания', () => {
        const editor = useEditor();
        editor.startConnect(out('time', 't'), [0, 0]);
        editor.updateConnect([5, 5], inp('out', 'opacity'));
        expect(editor.pending?.valid).toBe(true);
        editor.updateConnect([6, 6], out('uv', 'uv'));
        expect(editor.pending?.valid).toBe(false);
        editor.updateConnect([7, 7], null);
        expect(editor.pending?.valid).toBeNull();
    });

    it('взятие занятого входа снимает связь и тянет её от источника; отмена возвращает на место', () => {
        const editor = useEditor();
        const before = JSON.stringify(editor.graph.connections);

        editor.startConnect(inp('mask', 'x'), [0, 0]);
        expect(editor.graph.connections.length).toBe(JSON.parse(before).length - 1);
        expect(editor.pending?.origin).toEqual(out('noise', 'n'));

        editor.cancelConnect();
        expect(editor.pending).toBeNull();
        expect(JSON.stringify(editor.graph.connections)).toBe(before);

        editor.cancelConnect(); // повторная отмена безопасна
        expect(editor.graph.connections.length).toBe(JSON.parse(before).length);
    });

    it('отпустить снятую связь в пустоте удаляет её одним шагом истории', () => {
        const editor = useEditor();
        const count = editor.graph.connections.length;
        editor.startConnect(inp('mask', 'x'), [0, 0]);
        expect(editor.finishConnect(null)).toBe(false);
        expect(editor.graph.connections.length).toBe(count - 1);

        editor.undo();
        expect(editor.graph.connections.length).toBe(count);
    });
});

describe('типы пинов', () => {
    it('gen-пины получают выведенный тип, и он следует за связями', () => {
        const editor = useEditor();
        expect(editor.pinType({ node: 'coord', pin: 'a' }, 'in')).toBe('vec2'); // uv * 5 + время: vec2
        expect(editor.pinType({ node: 'coord', pin: 'result' }, 'out')).toBe('vec2');
        expect(editor.pinType({ node: 'body', pin: 'result' }, 'out')).toBe('vec3');
        expect(editor.pinType({ node: 'nope', pin: 'x' }, 'in')).toBeUndefined();
    });
});

describe('значения и история', () => {
    it('правка значения попадает в историю, серия правок одного поля склеивается', () => {
        const editor = useEditor();
        const noteStart = JSON.stringify(editor.graph.nodes.mask!.values);

        editor.setValue('mask', 'low', 0.1);
        editor.setValue('mask', 'low', 0.15);
        editor.setValue('mask', 'low', 0.2);
        expect(editor.graph.nodes.mask!.values.low).toBe(0.2);

        editor.undo();
        expect(JSON.stringify(editor.graph.nodes.mask!.values)).toBe(noteStart);
    });

    it('сдвиг нод не меняет ключ структуры, а правка значения и связей меняет', () => {
        const editor = useEditor();
        const key = editor.structureKey;

        editor.setSelection(['mask']);
        editor.moveSelected(30, 40);
        expect(editor.structureKey).toBe(key);

        editor.setValue('mask', 'low', 0.5);
        expect(editor.structureKey).not.toBe(key);
    });

    it('Delete удаляет выбранные ноды вместе со связями, а выбранную связь только её', () => {
        const editor = useEditor();
        const nodes = Object.keys(editor.graph.nodes).length;

        editor.setSelection(['noise']);
        editor.removeSelected();
        expect(Object.keys(editor.graph.nodes).length).toBe(nodes - 1);
        expect(editor.graph.connections.some((c) => c.from.node === 'noise' || c.to.node === 'noise')).toBe(false);

        const id = editor.graph.connections[0]!.id;
        const count = editor.graph.connections.length;
        editor.selectConnection(id);
        editor.removeSelected();
        expect(editor.graph.connections.length).toBe(count - 1);
    });
});

describe('палитра', () => {
    it('без origin ставит ноду в позицию курсора и выделяет её', () => {
        const editor = useEditor();
        const before = Object.keys(editor.graph.nodes).length;
        editor.openPalette([10, 10], [500, 400]);
        editor.createFromPalette('math/sin');

        expect(Object.keys(editor.graph.nodes).length).toBe(before + 1);
        const [id] = [...editor.selection];
        expect(editor.graph.nodes[id!]).toMatchObject({ type: 'math/sin', x: 500, y: 400 });
        expect(editor.palette).toBeNull();
    });

    it('с origin подключает новую ноду, подобрав пин по типу', () => {
        const editor = useEditor();
        editor.openPalette([0, 0], [800, 500], out('time', 't'));
        editor.fitsPaletteOrigin('output/surface'); // не бросает
        editor.createFromPalette('output/surface');

        const surface = Object.values(editor.graph.nodes).find((n) => n.type === 'output/surface' && n.id !== 'out')!;
        const link = editor.graph.connections.find((c) => c.to.node === surface.id)!;
        expect(link).toMatchObject({ from: { node: 'time', pin: 't' }, to: { pin: 'opacity' } }); // float → точный float, а не color
    });

    it('от входа создаёт ноду слева и подключает её выход', () => {
        const editor = useEditor();
        editor.openPalette([0, 0], [800, 500], inp('out', 'opacity'));
        editor.createFromPalette('noise/perlin');
        const noise = Object.values(editor.graph.nodes).filter((n) => n.type === 'noise/perlin').at(-1)!;
        expect(noise.x).toBeLessThan(800);
        expect(editor.graph.connections.find((c) => c.from.node === noise.id)).toMatchObject({ to: { node: 'out', pin: 'opacity' } });
    });

    it('fitsPaletteOrigin скрывает ноды, которым некуда подключить пин', () => {
        const editor = useEditor();
        editor.openPalette([0, 0], [0, 0], out('uv', 'uv')); // vec2 тянут к входу
        expect(editor.fitsPaletteOrigin('math/add')).toBe(true); // gen
        expect(editor.fitsPaletteOrigin('output/surface')).toBe(false); // color и float не принимают vec2
        expect(editor.fitsPaletteOrigin('input/time')).toBe(false); // входов нет
    });
});

describe('камера и файл', () => {
    it('fitView помещает весь граф в видимую область', () => {
        const editor = useEditor();
        editor.viewport = { w: 1000, h: 600 };
        editor.fitView();
        const { x, y, z } = editor.camera;
        for (const n of Object.values(editor.graph.nodes)) {
            expect(n.x * z + x).toBeGreaterThanOrEqual(0);
            expect(n.y * z + y).toBeGreaterThanOrEqual(0);
            expect((n.x + 210) * z + x).toBeLessThanOrEqual(1000);
            expect((n.y + 120) * z + y).toBeLessThanOrEqual(600);
        }
    });

    it('сохранение и открытие файла возвращают граф; чужой файл отклоняется с уведомлением', () => {
        const editor = useEditor();
        const text = editor.exportText();

        editor.newGraph();
        expect(Object.keys(editor.graph.nodes)).toHaveLength(0);

        expect(editor.importText(text)).toBeNull();
        expect(Object.keys(editor.graph.nodes).length).toBe(14);
        expect(editor.notice).toMatchObject({ kind: 'info', key: 'file.loaded', args: [14] });

        expect(editor.importText('{"format":"nope"}')).toMatchObject({ code: 'notTaofxFile' });
        expect(editor.notice).toMatchObject({ kind: 'error', key: 'file.error.notTaofxFile' });
        expect(Object.keys(editor.graph.nodes).length).toBe(14); // граф не изменился
    });

    it('автосохранение и восстановление', async () => {
        const first = useEditor();
        const stop = first.startAutosave();
        first.setValue('mask', 'low', 0.42);
        first.flushSave();
        stop();

        setActivePinia(createPinia());
        const second = useEditor();
        expect(second.restoreSaved()).toBe(true);
        expect(second.graph.nodes.mask!.values.low).toBe(0.42);
    });
});
