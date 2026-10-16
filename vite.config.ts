import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    base: './',
    plugins: [vue()],
    // dist занят библиотекой (vite.lib.config.ts), приложение собирается рядом.
    build: { outDir: 'dist-app' },
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
        // Пакеты, слинкованные с соседних папок (@1337exp/taoux), не должны тащить вторую копию Vue.
        dedupe: ['vue'],
    },
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
    },
});
