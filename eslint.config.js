import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';

import { base, tests, typed } from '@jasonsdevspace/config/eslint';
import { react } from '@jasonsdevspace/config/react';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

import { workspacePackages } from './scripts/repository.mjs';

/*
 * The house's presets from @jasonsdevspace/config, which every project repository takes, and after
 * them the rules that name this repository's own folders.
 */

/**
 * The workspace's packages, as paths from the root: the libraries in packages/ and what runs
 * in apps/.
 */
const WORKSPACES = workspacePackages(fileURLToPath(new URL('./', import.meta.url)));

/** Why a file that runs outside Node may not import one of Node's modules. */
const NO_NODE = 'Runs outside Node, so it cannot load Node.';

export default defineConfig(
    ...base({ ignores: ['**/dist-ssr'] }),
    ...typed({
        tsconfigRootDir: import.meta.dirname,
        // The files at the root of each package, which no tsconfig.json includes.
        allowDefaultProject: [
            'vitest.config.ts',
            'source-condition.ts',
            'apps/web/vite.config.ts',
            'apps/web/vite.worker.config.ts',
            'packages/scoring/vite.config.ts',
        ],
    }),
    // The app runs in a browser, and its hooks follow React's rules.
    ...react({ files: ['apps/web/**/*.{ts,tsx}'] }),
    {
        // The app's service worker runs beside its pages, with the worker's globals too.
        files: ['apps/web/**/*.{ts,tsx}'],
        languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } },
    },
    ...tests(),
    {
        // Every workspace's source runs in the browser, and the scoring package's in a phone's
        // script runtime as well. It may not load anything from Node, by a module's bare name
        // or with the prefix, or it stops running there. Enforced here rather than discovered
        // there, and for each workspace the manifest names, so a new one is held to it too.
        files: WORKSPACES.map((path) => `${path}/src/**/*.{ts,tsx}`),
        // The tests run only in Node.
        ignores: ['**/*.test.{ts,tsx}'],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    paths: builtinModules.map((name) => ({ name, message: NO_NODE })),
                    patterns: [{ group: ['node:*'], message: NO_NODE }],
                },
            ],
        },
    },
    {
        // A type assertion claims a shape nothing checked, and a non-null assertion claims a
        // value is there. Each value is typed by how it is built or narrowed by a check, and a
        // cast that is still needed is allowed on its own line by a disable comment that says
        // why. A const assertion claims nothing and is still allowed.
        files: ['**/*.{ts,tsx}'],
        rules: {
            '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
            '@typescript-eslint/no-non-null-assertion': 'error',
        },
    },
    // The browser tests wait on what the page does, never on a clock.
    {
        files: ['**/e2e/**/*.ts'],
        rules: {
            'no-restricted-properties': [
                'error',
                {
                    property: 'waitForTimeout',
                    message:
                        'Wait for what the page does instead, so the test is quick and steady.',
                },
            ],
        },
    },
    // Each package imports only what its own manifest declares, beside the
    // tools the repository's root provides, so a package never works only
    // because another one happens to install what it uses. Imports of types
    // count too, since a type a package needs is a package it needs. What
    // ships takes only its dependencies, and the tools only its checks.
    ...WORKSPACES.map((path) => ({
        files: [`${path}/**/*.{ts,tsx,mjs,js}`],
        rules: {
            'import-x/no-extraneous-dependencies': [
                'error',
                {
                    packageDir: [
                        fileURLToPath(new URL(`${path}/`, import.meta.url)),
                        fileURLToPath(new URL('./', import.meta.url)),
                    ],
                    includeTypes: true,
                    // A tool the code is checked or built with, never what it ships.
                    devDependencies: [
                        '**/*.test.{ts,tsx}',
                        '**/*.testing.ts',
                        '**/*.testing.tsx',
                        '**/*.config.{ts,js,mjs}',
                        '**/scripts/**',
                        '**/vitest.setup.ts',
                        '**/e2e/**',
                    ],
                },
            ],
        },
    }))
);
