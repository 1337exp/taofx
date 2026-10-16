// @vitest-environment node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Рантайм (src/lib, src/graph, src/nodes) уходит в игры без редактора, поэтому не должен знать про Vue, Pinia, i18n,
 * вид редактора и предпросмотр, а все его импорты внутри пакета обязаны быть относительными (иначе алиас `@/`
 * попадёт в .d.ts и сломает типы у потребителя).
 */
const srcDir = fileURLToPath(new URL('../src', import.meta.url));
const RUNTIME_DIRS = ['lib', 'graph', 'nodes'];

/** Что рантайму можно импортировать снаружи. @1337exp/taoux/ids вшивается в сборку (мелкий uid). */
const ALLOWED_EXTERNAL = [/^three(\/|$)/, /^@1337exp\/taoux\/ids$/];

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

describe('рантайм не зависит от редактора', () => {
    const files = RUNTIME_DIRS.flatMap((d) => walk(join(srcDir, d))).filter((f) => f.endsWith('.ts'));

    it('находит файлы рантайма', () => {
        expect(files.length).toBeGreaterThan(15);
    });

    it('импортирует только относительные пути и разрешённые пакеты', () => {
        for (const file of files) {
            for (const spec of imports(file)) {
                const ok = spec.startsWith('./') || spec.startsWith('../') || ALLOWED_EXTERNAL.some((re) => re.test(spec));
                expect(ok, `${file.slice(srcDir.length + 1)} импортирует «${spec}»`).toBe(true);
            }
        }
    });

    it('относительные импорты не выходят из рантайма (в editor, i18n, preview, App)', () => {
        for (const file of files) {
            for (const spec of imports(file).filter((s) => s.startsWith('.'))) {
                const target = join(file, '..', spec).slice(srcDir.length + 1).split(/[\\/]/)[0]!.replace(/\.ts$/, '');
                expect(RUNTIME_DIRS.includes(target), `${file.slice(srcDir.length + 1)} тянет «${spec}»`).toBe(true);
            }
        }
    });
});
