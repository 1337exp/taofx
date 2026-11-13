// Простой взрыв: файл частиц explosion.json + лист explosion-sheet.png. Клик по сцене запускает взрыв в этом месте.
import { createPixiParticles, type PixiParticleEffect } from '@1337exp/taofx/pixi';
import { Application } from 'pixi.js';

const SCALE = 100; // пикселей на единицу системы: размер частицы 1,92 это ячейка листа 192 px в натуральную величину

const app = new Application();
await app.init({ resizeTo: document.getElementById('stage')!, background: 0x14121a, preference: 'webgl', antialias: true });
document.getElementById('stage')!.appendChild(app.canvas);

const source = JSON.parse(await (await fetch('./explosion.json')).text());

interface Running {
    fx: PixiParticleEffect;
    start: number;
}
const running = new Set<Running>();

/** Взрыв в точке экрана. У каждого свой seed, поэтому клубы лежат по-разному. */
function explode(x: number, y: number): void {
    source.system.seed = (Math.random() * 1e6) | 0;
    const fx = createPixiParticles(JSON.stringify(source), { scale: SCALE });
    fx.object.position.set(x, y);
    app.stage.addChild(fx.object);
    running.add({ fx, start: performance.now() });
    if (fx.errors.length) console.warn(fx.errors);
}

// Время взрыва это время рантайма: свой отсчёт игры, паузу и перемотку тоже можно (setTime принимает любое значение).
// Взрыв закончен, когда прошли выпуск (duration) и самая долгая жизнь частицы.
// ?t=0.4 застывает взрыв на этой секунде (для разглядывания и настройки): время рантайма можно ставить как угодно.
const frozen = new URLSearchParams(location.search).get('t');
app.ticker.add(() => {
    const now = performance.now();
    for (const r of running) {
        const t = frozen !== null ? Number(frozen) : (now - r.start) / 1000;
        r.fx.setTime(t);
        const { system } = r.fx.file;
        const lifetime = Array.isArray(system.particle.lifetime) ? system.particle.lifetime[1] : system.particle.lifetime;
        if (frozen === null && t > system.duration + lifetime) {
            app.stage.removeChild(r.fx.object);
            r.fx.dispose();
            running.delete(r);
        }
    }
});

app.canvas.addEventListener('pointerdown', (e) => explode(e.offsetX, e.offsetY));
explode(app.screen.width / 2, app.screen.height / 2);
