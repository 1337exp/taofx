// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Рантайм уходит в игры без редактора и без выбора рендерера за них, поэтому:
 *   - ядро (graph, nodes, glsl, wgsl, particles) не знает ни про Vue, ни про three, ни про PIXI: им можно пользоваться без рендерера;
 *   - у каждого рендерера свой модуль и своя зависимость (tsl: three/tsl и three/webgpu, three: three, pixi: pixi.js),
 *     и они не лезут друг в друга;
 *   - внутри пакета только относительные импорты (иначе алиас `@/` попадёт в .d.ts и сломает типы у потребителя);
 *   - `lib` только собирает публичные входы из остальных модулей.
 */
const srcDir = fileURLToPath(new URL('../src', import.meta.url));

interface Zone {
    /** Папки модуля. */
    dirs: string[];
    /** Разрешённые внешние пакеты. */
    external: RegExp[];
    /** В какие модули можно лезть по относительным путям (кроме себя). */
    uses: string[];
}

/** @1337exp/taoux/ids (мелкий uid) и /ease (чистая математика переходов) вшиваются в сборку, больше пакет ни от чего не зависит. */
const IDS = /^@1337exp\/taoux\/(ids|ease)$/;

const ZONES: Record<string, Zone> = {
    core: { dirs: ['graph', 'nodes', 'glsl', 'wgsl', 'particles'], external: [IDS], uses: [] },
    tsl: { dirs: ['tsl'], external: [/^three\/(tsl|webgpu)$/], uses: ['core'] },
    three: { dirs: ['three'], external: [/^three$/], uses: ['core'] },
    pixi: { dirs: ['pixi'], external: [/^pixi\.js$/], uses: ['core'] },
    lib: { dirs: ['lib'], external: [], uses: ['core', 'tsl', 'three', 'pixi'] },
};

const zoneOfDir = (dir: string) => Object.keys(ZONES).find((z) => ZONES[z]!.dirs.includes(dir));

function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((e) => {
        const full = join(dir, e);
        return statSync(full).isDirectory() ? walk(full) : [full];
    });
}

const imports = (file: string) =>
    [...readFileSync(file, 'utf8').matchAll(/(?:^|\s)(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^import\s+['"]([^'"]+)['"]/gm)].map(
        (m) => (m[1] ?? m[2] ?? m[3])!,
    );

describe('рантайм не зависит от редактора и не смешивает рендереры', () => {
    for (const [name, zone] of Object.entries(ZONES)) {
        const files = zone.dirs.flatMap((d) => walk(join(srcDir, d))).filter((f) => f.endsWith('.ts'));

        it(`${name}: есть файлы`, () => {
            expect(files.length).toBeGreaterThan(0);
        });

        it(`${name}: внешние импорты только из разрешённых пакетов`, () => {
            for (const file of files) {
                for (const spec of imports(file).filter((s) => !s.startsWith('.'))) {
                    expect(zone.external.some((re) => re.test(spec)), `${file.slice(srcDir.length + 1)} импортирует «${spec}»`).toBe(true);
                }
            }
        });

        it(`${name}: относительные импорты не выходят за разрешённые модули`, () => {
            for (const file of files) {
                for (const spec of imports(file).filter((s) => s.startsWith('.'))) {
                    const targetDir = join(file, '..', spec).slice(srcDir.length + 1).split(/[\\/]/)[0]!.replace(/\.ts$/, '');
                    const target = zoneOfDir(targetDir);
                    const allowed = target === name || (target !== undefined && zone.uses.includes(target));
                    expect(allowed, `${file.slice(srcDir.length + 1)} тянет «${spec}» (модуль ${target ?? targetDir})`).toBe(true);
                }
            }
        });
    }
});
