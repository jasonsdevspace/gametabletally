import { browserFloor, themeScriptPlugin } from '@jasonsdevspace/design-kit/vite';
import react from '@vitejs/plugin-react';
import { defaultClientConditions, defaultServerConditions, defineConfig } from 'vite';

import { SOURCE_CONDITION } from '../../source-condition.js';
import { OWN_FILES } from './src/own-files.js';

/** Whether a module is one of the parts the app's screens share, not a file built on its own. */
const isSharedAppPart = (id: string): boolean =>
    /\/apps\/web\/src\/(?:app|play)\//.test(id) &&
    !OWN_FILES.some((file) => id.endsWith(`/${file}`));

export default defineConfig(({ isSsrBuild }) => ({
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
        // The list of what each source file became, which the prerender reads to have each page
        // fetch its own code beside the shell, and then removes.
        manifest: true,
        // The parts the app's screens share go in one file with the app's frame, so a page of the
        // app fetches a few files rather than one for each part, as record 4 sets out. A group that
        // leaves out its modules' imports takes strict execution order, so the modules in that
        // file run in the order they are imported, and entry signatures that may be extended. The
        // server build draws the pages ahead of time and is never split.
        rolldownOptions: isSsrBuild
            ? {}
            : {
                  preserveEntrySignatures: 'allow-extension',
                  output: {
                      strictExecutionOrder: true,
                      codeSplitting: {
                          groups: [
                              {
                                  name: (id: string) => (isSharedAppPart(id) ? 'app' : null),
                                  includeDependenciesRecursively: false,
                              },
                          ],
                      },
                  },
              },
    },
}));
