import { defineConfig } from 'vite';

/**
 * The service worker as one file, `sw.js`, beside the pages it serves.
 *
 * Library mode bundles the worker whole, since a worker cannot load chunks of its own. It writes
 * into the pages' build folder after the pages are built, so it must not empty it. The list of
 * files it caches is written into it after, by `scripts/precache.mjs`.
 */
export default defineConfig({
    build: {
        outDir: 'dist',
        emptyOutDir: false,
        sourcemap: false,
        lib: {
            entry: 'worker/sw.ts',
            formats: ['es'],
            fileName: () => 'sw.js',
        },
        rolldownOptions: {
            output: { codeSplitting: false },
        },
    },
});
