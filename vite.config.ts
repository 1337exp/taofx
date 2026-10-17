import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    base: './',
    plugins: [vue()],
    // dist занят библиотекой (vite.lib.config.ts), приложение собирается рядом.
    // Лимит предупреждения поднят: чанк превью это three (WebGPU), мельче он не станет, зато грузится отдельно и позже редактора.
    build: { outDir: 'dist-app', chunkSizeWarningLimit: 1000 },
    // Предсборку зависимостей строим только по редактору: страницы из examples/ тянут `three` и `pixi.js` другими путями,
    // и тогда у редактора появляются две копии three (TSL ломается: «No stack defined for assign»).
    optimizeDeps: { entries: ['index.html'] },
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
