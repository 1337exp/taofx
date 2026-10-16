import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    // Пакет @1337exp/taofx слинкован с соседней папки: ему нельзя тащить вторые копии three и pixi.js.
    resolve: { dedupe: ['three', 'pixi.js'] },
});
