// Собирает пример тем же ядром, что и редактор (src/flipbook, src/project, src/bundle), без ручной кодировки PNG и JSON:
//   explosion.taofx        проект: images.jpg, флипбук взрыва, эффект (открывается в редакторе, правится и собирается заново)
//   public/explosion/      пакет для игры: explosion.json (формат taofx-particles) и textures/explosion.sheet.png
// Источник эффекта (система частиц и граф материала) это effect-source.json; лист и кадры берутся из images.jpg.
// Запуск: npm run make
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import jpeg from 'jpeg-js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const { createServer } = await import(pathToFileURL(join(root, 'node_modules', 'vite', 'dist', 'node', 'index.js')).href);

// Ядро написано на TypeScript с алиасом `@/`: читаем его через vite (без своего сервера и браузера).
const vite = await createServer({
    root,
    configFile: false,
    logLevel: 'error',
    appType: 'custom',
    server: { middlewareMode: true },
    optimizeDeps: { noDiscovery: true, include: [] },
    resolve: { alias: { '@': join(root, 'src') } },
});
const load = (path) => vite.ssrLoadModule(path);

try {
    const { createProject } = await load('/src/project/project.ts');
    const { packProject } = await load('/src/project/archive.ts');
    const { buildBundle } = await load('/src/bundle/bundle.ts');
    const { autoDetect, backgroundOf, defaultKey, framesFor } = await load('/src/flipbook/model.ts');
    const { bakeSheet } = await load('/src/flipbook/flipbook.ts');
    const { encodePng } = await load('/src/flipbook/png.ts');
    const { parseParticles } = await load('/src/particles/serialize.ts');
    const { createDefaultRegistry } = await load('/src/nodes/index.ts');

    //--------------------------------------------------
    // 1. Кадры и лист. images.jpg это JPEG: альфы нет, фон плоский, кадры разной ширины стоят в ряд.
    const jpgBytes = readFileSync(join(here, 'public', 'images.jpg'));
    const decoded = jpeg.decode(jpgBytes, { useTArray: true });
    const image = { width: decoded.width, height: decoded.height, data: decoded.data };

    const color = backgroundOf(image);
    const detect = autoDetect(color);
    const frames = framesFor(detect, image);
    const key = defaultKey(color);
    // Ячейка 192 px, как в системе частиц (единица = 100 px, размер частицы 1,92 это ячейка в натуральную величину).
    const biggest = frames.reduce((m, f) => Math.max(m, f.w, f.h), 0);
    const padding = Math.max(0, Math.floor((192 - biggest) / 2));
    const sheet = bakeSheet(image, frames, { key, padding });
    console.log(`кадров: ${frames.length}, лист ${sheet.cols}x${sheet.rows} ячеек по ${sheet.cell} px`);

    //--------------------------------------------------
    // 2. Проект: картинка, лист, флипбук, эффект.
    const project = createProject({ name: 'Simple Explosion' });
    const source = project.addAsset('textures/images.jpg', jpgBytes);
    const sheetAsset = project.addAsset('textures/explosion.sheet.png', await encodePng(sheet));
    project.addDoc('flipbooks/explosion.flip.json', 'flipbook', { image: source.id, frames, fps: 12, detect, key, sheet: sheetAsset.id });

    // Источник проходит тот же строгий разбор, что и документ в редакторе (поля по умолчанию дописываются), поэтому пакет из
    // редактора и этот байт в байт одинаковы.
    const parsed = parseParticles(readFileSync(join(here, 'effect-source.json'), 'utf8'), createDefaultRegistry());
    if (!parsed.ok) throw new Error(`effect-source.json: ${JSON.stringify(parsed.error)}`);
    const effect = JSON.parse(JSON.stringify({ system: parsed.file.system, material: parsed.file.material }));
    const graph = effect.material;
    graph.textures = { sheet: { asset: sheetAsset.id } };
    // нода «Спрайт-лист» делит картинку на столько ячеек, сколько в листе
    for (const node of Object.values(graph.nodes)) {
        if (node.type === 'uv/flipbook') node.values = { ...node.values, columns: sheet.cols, rows: sheet.rows };
    }
    const fx = project.addDoc('effects/explosion.fx.json', 'effect', { system: effect.system, graph });
    writeFileSync(join(here, 'explosion.taofx'), await packProject(project));

    //--------------------------------------------------
    // 3. Пакет для игры.
    const bundle = buildBundle(project, fx.id);
    if (!bundle || bundle.problems.length) throw new Error(`пакет не собран: ${JSON.stringify(bundle?.problems)}`);
    const out = join(here, 'public', 'explosion');
    rmSync(out, { recursive: true, force: true });
    for (const file of bundle.files) {
        mkdirSync(dirname(join(out, file.path)), { recursive: true });
        writeFileSync(join(out, file.path), file.data);
    }
    console.log(`пакет: ${bundle.files.map((f) => f.path).join(', ')}`);
} finally {
    await vite.close();
}
