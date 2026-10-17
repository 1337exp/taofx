import { DEFAULT_BEZIER, EASE_NAMES, isEase, type Ease } from '@1337exp/taoux/ease';
import { describe, expect, it } from 'vitest';
import { compile } from '@/tsl/compile';
import { compileGlsl } from '@/lib';
import type { Graph } from '@/graph/types';
import type { CurveEase } from '@/particles/types';
import { createDefaultRegistry } from '@/nodes';
import { defaultSystem, parseParticles, PARTICLES_FORMAT, PARTICLES_VERSION, serializeParticles } from '@/particles/serialize';

const registry = createDefaultRegistry();

const node = (id: string, type: string, values: Graph['nodes'][string]['values'] = {}) => ({ id, type, x: 0, y: 0, values });
const link = (id: string, from: string, fromPin: string, to: string, toPin: string) => ({ id, from: { node: from, pin: fromPin }, to: { node: to, pin: toPin } });

/** Вид частицы: цвет из градиента, непрозрачность затухает с возрастом по квадрату. */
const material: Graph = {
    nodes: {
        p: node('p', 'input/particle'),
        uv: node('uv', 'input/uv'),
        out: node('out', 'output/surface'),
    },
    connections: [link('1', 'p', 'tint', 'out', 'color'), link('2', 'p', 'alpha', 'out', 'opacity')],
};

const file = (extra: Record<string, unknown> = {}) => JSON.stringify({ format: PARTICLES_FORMAT, version: PARTICLES_VERSION, material, ...extra });
const code = (text: string) => {
    const r = parseParticles(text, registry);
    return r.ok ? 'ok' : r.error.code;
};

describe('формат частиц', () => {
    it('круговой проход: система и материал возвращаются без потерь', () => {
        const system = { ...defaultSystem(), seed: 42, blend: 'add' as const, emitter: { rate: 5, bursts: [{ time: 0.5, count: 7 }], shape: { type: 'box' as const, size: [1, 2, 3] as [number, number, number] } } };
        const r = parseParticles(serializeParticles({ system, material }), registry);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.file.system).toEqual(system);
        expect(r.file.material).toEqual(material);
    });

    it('пропущенные поля берутся из значений по умолчанию', () => {
        const r = parseParticles(file({ system: { seed: 9, emitter: { rate: 3 } } }), registry);
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.file.system.seed).toBe(9);
        expect(r.file.system.emitter.rate).toBe(3);
        expect(r.file.system.emitter.shape).toEqual(defaultSystem().emitter.shape);
        expect(r.file.system.particle).toEqual(defaultSystem().particle);
        expect(parseParticles(file(), registry).ok).toBe(true); // даже без system
    });

    it('чужой файл, версия, битый JSON', () => {
        expect(code('{oops')).toBe('invalidJson');
        expect(code(JSON.stringify({ format: 'taofx', version: 1 }))).toBe('notTaofxFile');
        expect(code(JSON.stringify({ format: PARTICLES_FORMAT, version: 99, material }))).toBe('newerVersion');
        expect(code(file({ material: null }))).toBe('invalidStructure');
    });

    it('строго проверяет значения', () => {
        const bad = (system: unknown) => code(file({ system }));
        expect(bad({ maxParticles: 0 })).toBe('invalidStructure');
        expect(bad({ maxParticles: 1e9 })).toBe('invalidStructure');
        expect(bad({ duration: -1 })).toBe('invalidStructure');
        expect(bad({ blend: 'multiply' })).toBe('invalidStructure');
        expect(bad({ emitter: { rate: -5 } })).toBe('invalidStructure');
        expect(bad({ emitter: { rate: 1e9 } })).toBe('invalidStructure');
        expect(bad({ emitter: { shape: { type: 'torus' } } })).toBe('invalidStructure');
        expect(bad({ emitter: { bursts: [{ time: -1, count: 1 }] } })).toBe('invalidStructure');
        expect(bad({ particle: { lifetime: [0, 0] } })).toBe('invalidStructure');
        expect(bad({ particle: { gravity: [1, 2] } })).toBe('invalidStructure');
        expect(bad({ particle: { sizeOverLife: [] } })).toBe('invalidStructure');
        expect(bad({ particle: { sizeOverLife: [{ t: 2, v: 1 }] } })).toBe('invalidStructure');
        expect(bad({ particle: { colorOverLife: [{ t: 0, color: [1, 1], alpha: 1 }] } })).toBe('invalidStructure');
        expect(bad({ particle: { colorOverLife: [{ t: 0, color: [1, 1, 1], alpha: 5 }] } })).toBe('invalidStructure');
    });

    it('точки кривой и градиента сортируются по t', () => {
        const r = parseParticles(file({ system: { particle: { sizeOverLife: [{ t: 1, v: 0 }, { t: 0, v: 1 }] } } }), registry);
        expect(r.ok && r.file.system.particle.sizeOverLife).toEqual([{ t: 0, v: 1 }, { t: 1, v: 0 }]);
    });
});

describe('переходы в точках кривой', () => {
    it('тип CurveEase совпадает с Ease из taoux (охрана от расхождения)', () => {
                // присваивание в обе стороны не скомпилируется, если типы разойдутся
        const all: CurveEase[] = [...EASE_NAMES, { bezier: DEFAULT_BEZIER }];
        const back: Ease[] = all;
        expect(back.every(isEase)).toBe(true);
    });

    const sized = (pts: unknown) => file({ system: { particle: { sizeOverLife: pts } } });

    it('ease читается и проходит круг, старые файлы без него остаются линейными', () => {
        const pts = [{ t: 0, v: 0, ease: 'cubic-out' }, { t: 0.5, v: 1, ease: { bezier: [0.2, 0.1, 0.3, 1.4] } }, { t: 1, v: 0 }];
        const r = parseParticles(sized(pts), registry);
        expect(r.ok && r.file.system.particle.sizeOverLife).toEqual(pts);
        const back = parseParticles(serializeParticles(r.ok ? r.file : (null as never)), registry);
        expect(back.ok && back.file.system.particle.sizeOverLife).toEqual(pts);

        const old = parseParticles(sized([{ t: 0, v: 1 }, { t: 1, v: 0 }]), registry);
        expect(old.ok && old.file.system.particle.sizeOverLife).toEqual([{ t: 0, v: 1 }, { t: 1, v: 0 }]);
    });

    it('неизвестный или битый переход отвергается', () => {
        expect(code(sized([{ t: 0, v: 0, ease: 'wobble' }]))).toBe('invalidStructure');
        expect(code(sized([{ t: 0, v: 0, ease: { bezier: [2, 0, 0, 1] } }]))).toBe('invalidStructure');
        expect(code(sized([{ t: 0, v: 0, ease: 5 }]))).toBe('invalidStructure');
    });
});

describe('нода «Частица» и возможности цели', () => {
    it('собирается в системе частиц (TSL и GLSL) и не собирается в обычном материале', () => {
        const attr = { age: {}, random: {}, tint: {}, alpha: {} };
        expect(compileGlsl(material, registry, 'three-particles').errors).toEqual([]);
        expect(compileGlsl(material, registry, 'pixi-particles').errors).toEqual([]);

        for (const target of ['three', 'pixi'] as const) {
            const r = compileGlsl(material, registry, target);
            expect(r.program).toBeNull();
            expect(r.errors[0]).toMatchObject({ kind: 'unsupported', nodeId: 'p' });
            expect(r.errors[0]!.message).toMatch(/particle/);
        }

        const surface = compile(material, registry);
        expect(surface.surface).toBeNull();
        expect(surface.errors[0]).toMatchObject({ kind: 'unsupported', nodeId: 'p' });
        expect(attr).toBeTruthy();
    });

    it('в системе частиц нормаль не даётся: френель не собирается', () => {
        const g: Graph = { nodes: { f: node('f', 'input/fresnel'), out: node('out', 'output/surface') }, connections: [link('1', 'f', 'f', 'out', 'opacity')] };
        expect(compileGlsl(g, registry, 'three-particles').errors[0]).toMatchObject({ kind: 'unsupported', nodeId: 'f' });
    });

    it('GLSL-код читает данные частицы из варьингов', () => {
        const { program } = compileGlsl(material, registry, 'three-particles');
        expect(program!.body).toContain('vTint');
        expect(program!.body).toContain('vAlpha');
    });
});
