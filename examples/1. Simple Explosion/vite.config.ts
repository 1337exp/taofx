import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    // @1337exp/taofx слинкован с соседней папки: ему нельзя тащить вторую копию pixi.js.
    resolve: { dedupe: ['pixi.js'] },
    server: { port: 5274 },
});
