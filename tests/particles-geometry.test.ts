import { Matrix4, Quaternion, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { createDriver3D } from '@/particles/driver';
import { buildQuads2D, buildRibbon2D, buildRibbon3D, createSorter, quadBuffers, ribbonBuffers, viewInObject, type ViewPoint } from '@/particles/geometry';
import { defaultSystem } from '@/particles/serialize';
import { createBuffers, createSimulation, trailStrideOf } from '@/particles/sim';
import type { SystemDef } from '@/particles/types';

describe('сортировка по глубине', () => {
    it('дальние первыми, равные в порядке рождения, отрицательные и нули на месте', () => {
        const sorter = createSorter(8);
        const depths = [3, -2, 3, 0, -0.5, 10, 3, -2];
        depths.forEach((d, i) => (sorter.keys[i] = d));
        const order = Array.from(sorter.sort(depths.length));
        const sorted = order.map((i) => depths[i]!);
        expect(sorted).toEqual([...depths].sort((a, b) => b - a));
        // устойчивость: одинаковые глубины сохраняют порядок индексов
        expect(order.filter((i) => depths[i] === 3)).toEqual([0, 2, 6]);
        expect(order.filter((i) => depths[i] === -2)).toEqual([1, 7]);
    });

    it('случайные данные: порядок совпадает с обычной сортировкой', () => {
        const n = 3000;
        const sorter = createSorter(n);
        const depths = Array.from({ length: n }, (_, i) => Math.sin(i * 12.9898) * 43758.5453 % 100);
        depths.forEach((d, i) => (sorter.keys[i] = d));
        const order = Array.from(sorter.sort(n));
        const expected = depths.map((d, i) => [d, i] as const).sort((a, b) => Math.fround(b[0]) - Math.fround(a[0]) || a[1] - b[1]).map((x) => x[1]);
        expect(order).toEqual(expected);
    });
});

describe('камера в координатах объекта', () => {
    it('совпадает с обратной матрицей three.js (поворот, масштаб, смещение)', () => {
        const object = new Matrix4().compose(new Vector3(1, -2, 3), new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 0.7), new Vector3(2, 2, 2));
        const camera = new Matrix4().compose(new Vector3(4, 5, 6), new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -0.4), new Vector3(1, 1, 1));
        const out: ViewPoint = { position: [0, 0, 0], forward: [0, 0, 0] };
        viewInObject(camera.elements, object.elements, out);

        const inverse = object.clone().invert();
        const pos = new Vector3(4, 5, 6).applyMatrix4(inverse);
        const forward = new Vector3(0, 0, -1).transformDirection(camera).transformDirection(inverse);
        out.position.forEach((v, i) => expect(v).toBeCloseTo(pos.toArray()[i]!, 6));
        out.forward.forEach((v, i) => expect(v).toBeCloseTo(forward.toArray()[i]!, 6));
    });

    it('единичный объект: камера на месте, взгляд по −Z', () => {
        const out: ViewPoint = { position: [9, 9, 9], forward: [9, 9, 9] };
        viewInObject(new Matrix4().makeTranslation(0, 1, 5).elements, new Matrix4().elements, out);
        [0, 1, 5].forEach((v, i) => expect(out.position[i]!).toBeCloseTo(v, 9));
        [0, 0, -1].forEach((v, i) => expect(out.forward[i]!).toBeCloseTo(v, 9));
    });
});

/** Система с лентой: частицы летят по дуге. */
function ribbonSystem(patch: Partial<SystemDef> = {}): SystemDef {
    const d = defaultSystem();
    return {
        ...d,
        duration: 2,
        loop: true,
        seed: 3,
        maxParticles: 40,
        emitter: { rate: 12, bursts: [], shape: { type: 'cone', angle: 10, radius: 0.1 } },
        particle: { ...d.particle, lifetime: 2, speed: [2, 3], size: 0.2, gravity: [0, -3, 0] },
        render: { ...d.render, mode: 'ribbon', sort: true, trail: { length: 0.6, segments: 10, widthOverLength: [{ t: 0, v: 1 }, { t: 1, v: 0 }] } },
        ...patch,
    };
}

describe('лента', () => {
    const system = ribbonSystem();
    const sim = createSimulation(system);
    const src = createBuffers(system.maxParticles, trailStrideOf(system));
    const count = sim.seek(2.5, src);

    it('в буфере вершины и индексы по числу точек шлейфа, индексы в пределах вершин', () => {
        const out = ribbonBuffers(system.maxParticles, system.render.trail.segments, 3);
        const r = buildRibbon3D(src, count, null, system.render.trail, out);
        let points = 0;
        let segments = 0;
        for (let i = 0; i < count; i++) {
            const c = src.trailCount[i]!;
            if (c >= 2) {
                points += c;
                segments += c - 1;
            }
        }
        expect(points).toBeGreaterThan(20);
        expect(r.vertices).toBe(points * 2);
        expect(r.indices).toBe(segments * 6);
        for (let k = 0; k < r.indices; k++) expect(out.index[k]!).toBeLessThan(r.vertices);
    });

    it('пара вершин делит точку пути, касательную и ширину; ширина идёт по кривой от размера частицы к нулю', () => {
        const out = ribbonBuffers(system.maxParticles, system.render.trail.segments, 3);
        buildRibbon3D(src, count, null, system.render.trail, out);
        let v = 0;
        for (let i = 0; i < count; i++) {
            const c = src.trailCount[i]!;
            if (c < 2) continue;
            for (let j = 0; j < c; j++) {
                const a = (v + j * 2) * 3;
                const b = a + 3;
                // обе вершины пары в одной точке пути: сторону и ширину добавит шейдер
                for (let k = 0; k < 3; k++) {
                    expect(out.position[a + k]!).toBe(src.trailPos[(i * src.trailStride + j) * 3 + k]!);
                    expect(out.position[b + k]!).toBe(out.position[a + k]!);
                    expect(out.tangent[b + k]!).toBe(out.tangent[a + k]!);
                }
                expect(out.width[v + j * 2 + 1]!).toBe(out.width[v + j * 2]!);
                // касательная единичная (или нулевая у вырожденного пути)
                const tl = Math.hypot(out.tangent[a]!, out.tangent[a + 1]!, out.tangent[a + 2]!);
                expect(tl < 1e-6 || Math.abs(tl - 1) < 1e-5).toBe(true);
                // uv.y: 0 и 1 поперёк, uv.x от 1 (голова) к 0
                expect(out.uv[(v + j * 2) * 2 + 1]!).toBe(0);
                expect(out.uv[(v + j * 2 + 1) * 2 + 1]!).toBe(1);
            }
            expect(out.width[v]!).toBeCloseTo(src.size[i]! / 2, 5); // голова: u = 0, кривая 1
            expect(out.width[v + (c - 1) * 2]!).toBeLessThanOrEqual(out.width[v]! + 1e-6);
            if (c >= 6) {
                expect(out.width[v + (c - 1) * 2]!).toBeLessThan(out.width[v]! * 0.6); // старый шлейф сужен кривой
                expect(out.uv[(v + (c - 1) * 2) * 2]!).toBeLessThan(1);
            }
            expect(out.uv[v * 2]!).toBe(1);
            v += c * 2;
        }
    });

    it('касательная смотрит от хвоста к голове (куда летит частица)', () => {
        const out = ribbonBuffers(system.maxParticles, system.render.trail.segments, 3);
        buildRibbon3D(src, count, null, system.render.trail, out);
        let v = 0;
        let checked = 0;
        for (let i = 0; i < count; i++) {
            const c = src.trailCount[i]!;
            if (c < 4) continue;
            const base = i * src.trailStride * 3;
            // в середине шлейфа: касательная ≈ голова минус хвост по соседним точкам
            const a = base + 1 * 3;
            const b = base + 3 * 3;
            const dx = src.trailPos[a]! - src.trailPos[b]!;
            const dy = src.trailPos[a + 1]! - src.trailPos[b + 1]!;
            const dz = src.trailPos[a + 2]! - src.trailPos[b + 2]!;
            const len = Math.hypot(dx, dy, dz);
            if (len > 1e-6) {
                const t = (v + 2 * 2) * 3;
                expect(out.tangent[t]! * (dx / len) + out.tangent[t + 1]! * (dy / len) + out.tangent[t + 2]! * (dz / len)).toBeCloseTo(1, 4);
                checked++;
            }
            v += c * 2;
        }
        expect(checked).toBeGreaterThan(0);
    });

    it('2D: в экранной плоскости, ось Y перевёрнута, ширина с учётом масштаба', () => {
        const out = ribbonBuffers(system.maxParticles, system.render.trail.segments, 2);
        const r = buildRibbon2D(src, count, system.render.trail, 100, out);
        expect(r.vertices).toBeGreaterThan(0);
        // голова первой ленты: середина пары вершин = положение частицы (Y вниз)
        let i = 0;
        while (src.trailCount[i]! < 2) i++;
        const mx = (out.position[0]! + out.position[2]!) / 2;
        const my = (out.position[1]! + out.position[3]!) / 2;
        expect(mx).toBeCloseTo(src.pos[i * 3]! * 100, 3);
        expect(my).toBeCloseTo(-src.pos[i * 3 + 1]! * 100, 3);
        expect(Math.hypot(out.position[2]! - out.position[0]!, out.position[3]! - out.position[1]!)).toBeCloseTo(src.size[i]! * 100, 3);
    });
});

describe('квадраты в 2D', () => {
    it('повёрнутый квадрат: углы на расстоянии размера от центра, нужный поворот и переворот Y', () => {
        const system = ribbonSystem({ render: { ...defaultSystem().render, mode: 'billboard' } });
        const sim = createSimulation(system);
        const src = createBuffers(system.maxParticles);
        const count = sim.seek(1.2, src);
        const out = quadBuffers(system.maxParticles, 2);
        const r = buildQuads2D(src, count, null, 50, out);
        expect(r.vertices).toBe(count * 4);
        expect(r.indices).toBe(count * 6);
        for (let i = 0; i < Math.min(count, 5); i++) {
            const cx = src.pos[i * 3]! * 50;
            const cy = -src.pos[i * 3 + 1]! * 50;
            const size = src.size[i]! * 50;
            const rot = src.rot[i]!;
            // как у прежнего построения: x = cx + (lx·cos − ly·sin)·size, y = cy − (lx·sin + ly·cos)·size
            const corners = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];
            corners.forEach(([lx, ly], k) => {
                expect(out.position[(i * 4 + k) * 2]!).toBeCloseTo(cx + (lx! * Math.cos(rot) - ly! * Math.sin(rot)) * size, 3);
                expect(out.position[(i * 4 + k) * 2 + 1]!).toBeCloseTo(cy - (lx! * Math.sin(rot) + ly! * Math.cos(rot)) * size, 3);
            });
        }
    });

    it('вытянутый: длинная сторона вдоль скорости на экране', () => {
        const system = ribbonSystem({ render: { ...defaultSystem().render, mode: 'stretch', stretch: 0.5 } });
        const sim = createSimulation(system);
        const src = createBuffers(system.maxParticles);
        const count = sim.seek(1.2, src);
        const out = quadBuffers(system.maxParticles, 2);
        buildQuads2D(src, count, 0.5, 100, out);
        for (let i = 0; i < Math.min(count, 5); i++) {
            const vx = src.vel[i * 3]!;
            const vy = -src.vel[i * 3 + 1]!;
            const edge = [out.position[(i * 4 + 1) * 2]! - out.position[(i * 4) * 2]!, out.position[(i * 4 + 1) * 2 + 1]! - out.position[(i * 4) * 2 + 1]!];
            const along = (edge[0]! * vx + edge[1]! * vy) / (Math.hypot(...(edge as [number, number])) * Math.hypot(vx, vy));
            expect(along).toBeCloseTo(1, 4);
            const speed = Math.hypot(src.vel[i * 3]!, src.vel[i * 3 + 1]!, src.vel[i * 3 + 2]!);
            expect(Math.hypot(edge[0]!, edge[1]!)).toBeCloseTo(src.size[i]! * 100 * (1 + 0.5 * speed), 3);
        }
    });
});

describe('драйвер three', () => {
    const base = ribbonSystem({ render: { ...defaultSystem().render, mode: 'billboard', sort: true }, blend: 'normal' });

    it('с сортировкой инстансы идут от дальних к ближним, без камеры в порядке рождения', () => {
        const driver = createDriver3D(base);
        const n = driver.seek(2.3);
        expect(n).toBeGreaterThan(10);
        const view: ViewPoint = { position: [0, 0, 20], forward: [0, 0, -1] };
        const p = driver.prepare(view);
        expect(p.instances).toBe(n);
        const depth = (i: number) => (driver.instances.pos[i * 3 + 2]! - 20) * -1; // вдоль −Z: глубина = 20 − z
        for (let i = 1; i < n; i++) expect(depth(i - 1)).toBeGreaterThanOrEqual(depth(i) - 1e-5);
        // состав тот же, что у исходного выхода (только порядок другой)
        const key = (b: Float32Array, i: number) => b[i * 3]!.toFixed(4) + '|' + b[i * 3 + 1]!.toFixed(4);
        expect(new Set(Array.from({ length: n }, (_, i) => key(driver.instances.pos, i)))).toEqual(new Set(Array.from({ length: n }, (_, i) => key(driver.buffers.pos, i))));
        driver.prepare(null);
        for (let i = 0; i < n; i++) expect(driver.instances.pos[i * 3]!).toBe(driver.buffers.pos[i * 3]!);
    });

    it('сложение не сортируется: инстансы это сам выход симуляции', () => {
        const driver = createDriver3D({ ...base, blend: 'add' });
        expect(driver.instances).toBe(driver.buffers);
    });

    it('лента: число индексов соответствует сборке и от камеры не зависит', () => {
        const driver = createDriver3D(ribbonSystem());
        driver.seek(2.5);
        const p = driver.prepare({ position: [0, 0, 10], forward: [0, 0, -1] });
        const before = Array.from(driver.ribbon!.position.slice(0, 60));
        driver.prepare(null);
        expect(Array.from(driver.ribbon!.position.slice(0, 60))).toEqual(before);
        expect(p.instances).toBe(0);
        expect(p.indices).toBeGreaterThan(0);
        expect(p.indices % 6).toBe(0);
    });
});
