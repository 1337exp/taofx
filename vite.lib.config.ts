import { defineConfig } from 'vite';

// Сборка рантайма для игр: ядро без рендерера и по входу на рендерер (tsl, three, pixi). Рендереры остаются внешними
// (их ставит игра), общий код rollup вынесет в chunks.
export default defineConfig({
    build: {
        lib: {
            entry: { index: 'src/lib/index.ts', tsl: 'src/lib/tsl.ts', three: 'src/lib/three.ts', pixi: 'src/lib/pixi.ts' },
            formats: ['es'],
        },
        outDir: 'dist',
        emptyOutDir: true,
        minify: false,
        sourcemap: true,
        rollupOptions: {
            external: [/^three(\/|$)/, /^pixi\.js$/],
            output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name]-[hash].js' },
        },
    },
});
