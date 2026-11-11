import { fileURLToPath } from 'node:url';

import js from '@eslint/js';
import { defineConfig } from 'eslint/config';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import { workspacePackages } from './scripts/repository.mjs';

/*
 * Three kinds of rule live here.
 *
 * Mechanical ones, such as import order, are fixed by `eslint --fix` and
 * exist so a diff never carries reordering noise. Bug catchers, from
 * typescript-eslint's type-aware set and SonarJS, flag code that is wrong
 * rather than code that is unusual. Size budgets catch a function that has
 * grown past what a reader can hold at once. Everything is an error, since
 * a warning that does not fail the build is a rule nobody follows.
 */

/** Rules that fire on real mistakes and almost never on style. */
const bugCatchers = {
    'sonarjs/no-identical-conditions': 'error',
    'sonarjs/no-identical-expressions': 'error',
    'sonarjs/no-all-duplicated-branches': 'error',
    'sonarjs/no-element-overwrite': 'error',
    'sonarjs/no-ignored-return': 'error',
    'sonarjs/no-use-of-empty-return-value': 'error',
    'sonarjs/no-empty-collection': 'error',
    'sonarjs/no-unused-collection': 'error',
    'sonarjs/no-collection-size-mischeck': 'error',
    'sonarjs/no-extra-arguments': 'error',
    'sonarjs/no-gratuitous-expressions': 'error',
    'sonarjs/no-redundant-jump': 'error',
    eqeqeq: ['error', 'always'],
    'no-param-reassign': 'error',
    'array-callback-return': 'error',
    'no-return-assign': 'error',
};

/** How large a function may grow before it should be split. */
const sizeBudgets = {
    complexity: ['error', 15],
    'sonarjs/cognitive-complexity': ['error', 15],
    'max-depth': ['error', 4],
    'max-params': ['error', 4],
};

/**
 * The workspace's packages, as paths from the root: the libraries in packages/ and what runs
 * in apps/.
 */
const WORKSPACES = workspacePackages(fileURLToPath(new URL('./', import.meta.url)));

export default defineConfig(
    {
        linterOptions: { reportUnusedDisableDirectives: 'error' },
    },
    {
        // The builds in dist are checked where they are written from, the sources. ESLint leaves
        // node_modules out on its own.
        ignores: ['**/dist'],
    },
    {
        extends: [js.configs.recommended, ...tseslint.configs.recommended],
        files: ['**/*.{ts,tsx,mjs,js}'],
        languageOptions: {
            ecmaVersion: 2023,
            globals: globals.node,
        },
        plugins: { 'simple-import-sort': simpleImportSort, 'import-x': importX, sonarjs },
        rules: {
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            // Every callable is a value, so a file reads top to bottom with no
            // hoisting surprises.
            'func-style': ['error', 'expression'],
            'prefer-arrow-callback': ['error', { allowNamedFunctions: false }],
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',
            'import-x/first': 'error',
            'import-x/newline-after-import': 'error',
            'import-x/no-duplicates': ['error', { 'prefer-inline': true }],
            ...bugCatchers,
            ...sizeBudgets,
        },
    },
    {
        // Rules that need the types. The project service reads each
        // package's own tsconfig, which includes its tests.
        files: ['**/*.{ts,tsx}'],
        extends: [...tseslint.configs.recommendedTypeChecked],
        languageOptions: {
            parserOptions: {
                projectService: {
                    // The two files at the root, which no tsconfig includes.
                    allowDefaultProject: ['vitest.config.ts', 'source-condition.ts'],
                },
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',
            '@typescript-eslint/require-array-sort-compare': 'error',
            '@typescript-eslint/prefer-nullish-coalescing': 'error',
            '@typescript-eslint/prefer-optional-chain': 'error',
            '@typescript-eslint/no-unnecessary-condition': 'error',
            '@typescript-eslint/prefer-readonly': 'error',
            // The scoring rules are meant to be exhaustive over their unions, and this
            // is what makes a missing case fail the build.
            '@typescript-eslint/switch-exhaustiveness-check': 'error',
        },
    },
    {
        // The app runs in a browser, and its hooks follow React's rules.
        files: ['apps/web/**/*.{ts,tsx}'],
        languageOptions: { globals: { ...globals.browser, ...globals.serviceworker } },
        plugins: { 'react-hooks': reactHooks },
        // What the plugin recommends, with every warning made an error and its options kept.
        rules: Object.fromEntries(
            Object.entries(reactHooks.configs.flat.recommended.rules).map(([rule, setting]) => [
                rule,
                setting === 'warn'
                    ? 'error'
                    : Array.isArray(setting) && setting[0] === 'warn'
                      ? ['error', ...setting.slice(1)]
                      : setting,
            ])
        ),
    },
    {
        // A fixture builder takes a record's fields in order, so a table of fixtures reads as one
        // row per line, which an object of named fields would spread over several.
        files: ['**/*.test.{ts,tsx}'],
        rules: { 'max-params': 'off' },
    },
    {
        // What runs in the browser, and for the scoring package in a phone's script runtime as
        // well. It may not load anything from Node, or it stops running there. Enforced here
        // rather than discovered there.
        files: ['packages/scoring/src/**/*.ts', 'apps/web/src/**/*.{ts,tsx}'],
        // The tests run only in Node.
        ignores: ['**/*.test.{ts,tsx}'],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    patterns: [
                        {
                            group: ['node:*'],
                            message: 'Runs outside Node, so it cannot load Node.',
                        },
                    ],
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
                        '**/*.config.{ts,js,mjs}',
                        '**/vitest.setup.ts',
                    ],
                },
            ],
        },
    }))
);
