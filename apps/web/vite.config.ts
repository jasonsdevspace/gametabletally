import react from '@vitejs/plugin-react';
import { defaultClientConditions, defineConfig } from 'vite';

import { SOURCE_CONDITION } from '../../source-condition.js';

export default defineConfig({
    plugins: [react()],
    // Each workspace package's source, by the condition its exports name, so the app builds
    // without the packages being built first.
    resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
    },
});
