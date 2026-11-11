import { defineConfig } from 'vite';

/**
 * The package as one script with nothing to load beside it, which is the form a phone's script
 * runtime takes: evaluated once, it leaves `GameTableTallyScoring` as a global with the
 * package's exports on it. The modules beside it in dist, which `tsc` writes, are what a
 * bundler or Node imports.
 */
export default defineConfig({
    build: {
        outDir: 'dist',
        // The compiled modules are already there.
        emptyOutDir: false,
        // Left readable, so an error in a runtime with no source maps still names its place.
        minify: false,
        target: 'es2020',
        lib: {
            entry: 'src/index.ts',
            name: 'GameTableTallyScoring',
            formats: ['iife'],
            fileName: () => 'scoring.global.js',
        },
    },
});
