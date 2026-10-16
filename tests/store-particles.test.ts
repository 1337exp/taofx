// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { parseDoc, serializeDoc } from '@/editor/doc';
import { useEditor } from '@/editor/store';
import { createDefaultRegistry } from '@/nodes';

beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
});

describe('система частиц в документе', () => {
    it('по умолчанию документ это обычный материал; включение добавляет параметры и отменяется', () => {
        const editor = useEditor();
        expect(editor.system).toBeNull();
        editor.enableParticles();
        expect(editor.system).not.toBeNull();
        expect(editor.systemKey).not.toBe('null');
        editor.undo();
        expect(editor.system).toBeNull();
        editor.redo();
        expect(editor.system).not.toBeNull();
    });

    it('правки параметров идут в историю, серия одного поля склеивается', () => {
        const editor = useEditor();
        editor.enableParticles();
        const before = editor.system!.emitter.rate;
        editor.updateSystem('rate', (s) => (s.emitter.rate = 10));
        editor.updateSystem('rate', (s) => (s.emitter.rate = 20));
        editor.updateSystem('rate', (s) => (s.emitter.rate = 30));
        expect(editor.system!.emitter.rate).toBe(30);
        editor.undo();
        expect(editor.system!.emitter.rate).toBe(before);
    });

    it('updateSystem без системы ничего не делает', () => {
        const editor = useEditor();
        editor.updateSystem('rate', (s) => (s.emitter.rate = 1));
        expect(editor.system).toBeNull();
        expect(editor.canUndo).toBe(false);
    });

    it('новая система заменяет документ стартовым фонтаном, отменяется одним шагом', () => {
        const editor = useEditor();
        const nodes = Object.keys(editor.graph.nodes).length;
        editor.startParticles();
        expect(editor.system?.blend).toBe('add');
        expect(editor.graph.nodes.p?.type).toBe('input/particle');
        expect(editor.takeFitRequest()).toBe(true);
        expect(editor.takeFitRequest()).toBe(false);
        editor.undo();
        expect(editor.system).toBeNull();
        expect(Object.keys(editor.graph.nodes).length).toBe(nodes);
    });

    it('обычный материал возвращается выключением частиц', () => {
        const editor = useEditor();
        editor.startParticles();
        editor.disableParticles();
        expect(editor.system).toBeNull();
    });

    it('файл: частицы пишутся и читаются в формате taofx-particles, материал в taofx', () => {
        const editor = useEditor();
        const registry = createDefaultRegistry();

        const plain = parseDoc(editor.exportText(), registry);
        expect(plain.ok && plain.doc.system).toBeNull();

        editor.startParticles();
        const text = editor.exportText();
        expect(JSON.parse(text).format).toBe('taofx-particles');
        editor.newGraph();
        expect(editor.importText(text)).toBeNull();
        expect(editor.system?.emitter.rate).toBe(90);
        expect(Object.keys(editor.graph.nodes)).toContain('p');
    });

    it('автосохранение и восстановление сохраняют систему', () => {
        const first = useEditor();
        const stop = first.startAutosave();
        first.startParticles();
        first.updateSystem('seed', (s) => (s.seed = 777));
        first.flushSave();
        stop();

        setActivePinia(createPinia());
        const second = useEditor();
        expect(second.restoreSaved()).toBe(true);
        expect(second.system?.seed).toBe(777);
    });

    it('serializeDoc и parseDoc взаимно обратны, чужой файл отклоняется', () => {
        const registry = createDefaultRegistry();
        const editor = useEditor();
        editor.startParticles();
        const doc = { graph: editor.graph, system: editor.system };
        const back = parseDoc(serializeDoc(doc, { x: 1, y: 2, z: 1 }, true), registry);
        expect(back.ok && back.view).toEqual({ x: 1, y: 2, z: 1 });
        expect(back.ok && back.doc.system).toEqual(doc.system);
        expect(parseDoc('{"format":"nope"}', registry).ok).toBe(false);
    });
});
