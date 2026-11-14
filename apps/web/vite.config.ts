import { browserFloor, themeScriptPlugin } from '@jasonsdevspace/design-kit/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defaultServerConditions, defineConfig } from 'vite';

import { SOURCE_CONDITION } from '../../source-condition.js';

export default defineConfig({
    // The design kit's theme script, put inline at the marker in the page's head, so the theme is
    // set before anything paints.
    plugins: [react(), themeScriptPlugin()],
    // Each workspace package's source, by the condition its exports name, so the app builds
    // without the packages being built first.
    resolve: { conditions: [SOURCE_CONDITION, ...defaultClientConditions] },
    ssr: { resolve: { conditions: [SOURCE_CONDITION, ...defaultServerConditions] } },
    build: {
        outDir: 'dist',
        // The kit's floor, which keeps each light-dark() color as it is written.
        target: browserFloor(),
        emptyOutDir: true,
        // Source maps are served beside the scripts for reading a failure back to the source, and
        // the service worker leaves them out of what it caches on a phone.
        sourcemap: true,
    },
});
