import { defineConfig } from 'vite';

export default defineConfig({
    base: './',
    // Пакет @1337exp/taofx слинкован с соседней папки: ему нельзя тащить вторую копию three.
    resolve: { dedupe: ['three'] },
});
