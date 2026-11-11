import { defaultClientConditions, defaultServerConditions } from 'vite';
import { defineConfig } from 'vitest/config';

import { SOURCE_CONDITION } from './source-condition.js';

export default defineConfig({
    // Workspace packages resolve to their sources, by the condition each one's
    // exports name, so a test never depends on a build having run first.
    resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
    ssr: { resolve: { conditions: [SOURCE_CONDITION, ...defaultServerConditions] } },
    test: {
        // What is under apps/ needs a document. Everything else runs in Node. Each project takes
        // every test file in its folders, wherever it sits, so none is linted and never run.
        projects: [
            {
                extends: true,
                test: {
                    name: 'node',
                    environment: 'node',
                    include: ['packages/*/**/*.test.{ts,tsx}', 'scripts/*.test.ts'],
                },
            },
            {
                extends: true,
                test: {
                    name: 'web',
                    environment: 'jsdom',
                    include: ['apps/*/**/*.test.{ts,tsx}'],
                    setupFiles: ['apps/web/vitest.setup.ts'],
                },
            },
        ],
    },
});
