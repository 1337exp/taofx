import { defineConfig } from 'vite';

// Сборка рантайма для игр: один ESM-файл без Vue и редактора. three остаётся внешним (его ставит игра).
export default defineConfig({
    build: {
        lib: { entry: 'src/lib/index.ts', formats: ['es'], fileName: () => 'index.js' },
        outDir: 'dist',
        emptyOutDir: true,
        minify: false,
        sourcemap: true,
        rollupOptions: {
            external: [/^three(\/|$)/],
        },
    },
});
