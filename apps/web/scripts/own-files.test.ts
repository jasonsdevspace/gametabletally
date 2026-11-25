import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ENTRY_FILES, FRAME_FILE, OWN_FILES, SCREEN_FILES } from '../src/own-files.js';

/*
 * Each screen, each game's round entry and the app's frame load on demand, so no file of the app
 * imports one of them directly, and their loaders import each by the file the list names. A screen
 * imported directly would ship in the file of whatever imported it, on every page that loads it.
 */

/** The app's folder, from which a source file is named, as `src/app/PlayStart.tsx`. */
const APP = join(import.meta.dirname, '..');

/** Every source file of the app but the tests and their helpers. */
const sources = (): string[] =>
    readdirSync(join(APP, 'src'), { recursive: true, withFileTypes: true })
        .filter(({ name }) => /\.tsx?$/.test(name) && !/\.test\.|\.testing\./.test(name))
        .map((entry) => relative(APP, join(entry.parentPath, entry.name)));

/** A relative import as the source file it names, from the file that imports it. */
const fileOf = (from: string, path: string): string | null => {
    if (!path.startsWith('.')) return null;
    const named = normalize(join(dirname(from), path));
    for (const candidate of [named.replace(/\.js$/, '.tsx'), named.replace(/\.js$/, '.ts')])
        if (sources().includes(candidate)) return candidate;
    return named;
};

/**
 * What a file imports directly, or exports from another file, leaving out imports and exports of
 * types alone, which leave no code behind.
 */
const directImports = (file: string, text: string): string[] =>
    [...text.matchAll(/^(?:import|export)\s+(?:([^'";]*?)\s+from\s+)?'([^']+)';/gms)].flatMap(
        ([, names, path]) => {
            if (path === undefined) return [];
            const typesOnly =
                names !== undefined &&
                (/^type\s/.test(names) ||
                    /^\{([^}]*)\}$/s
                        .exec(names.trim())?.[1]
                        ?.split(',')
                        .map((name) => name.trim())
                        .filter(Boolean)
                        .every((name) => name.startsWith('type ')) === true);
            const target = typesOnly ? null : fileOf(file, path);
            return target === null ? [] : [target];
        }
    );

/** What a file loads on demand, by `import()`. */
const loadedOnDemand = (file: string, text: string): string[] =>
    [...text.matchAll(/\bimport\('([^']+)'\)/g)].flatMap(([, path]) => {
        const target = path === undefined ? null : fileOf(file, path);
        return target === null ? [] : [target];
    });

const ON_DEMAND: readonly string[] = [...OWN_FILES, FRAME_FILE];

describe('the files loaded on demand', () => {
    it('are imported directly by no file of the app', () => {
        const direct = sources().flatMap((file) =>
            directImports(file, readFileSync(join(APP, file), 'utf8'))
                .filter((target) => ON_DEMAND.includes(target) && target !== file)
                .map((target) => `${file} imports ${target}`)
        );
        expect(direct).toEqual([]);
    });

    it('are each loaded by the file the list names', () => {
        const read = (file: string) => readFileSync(join(APP, file), 'utf8');
        expect(loadedOnDemand('src/screens.tsx', read('src/screens.tsx')).sort()).toEqual(
            [...Object.values(SCREEN_FILES), FRAME_FILE].sort()
        );
        expect(loadedOnDemand('src/app/entries.ts', read('src/app/entries.ts')).sort()).toEqual(
            Object.values(ENTRY_FILES).sort()
        );
    });

    it('would catch a screen imported or exported directly, or a frame for more than its types', () => {
        expect(
            directImports('src/screens.tsx', "import { PlayStart } from './app/PlayStart.js';")
        ).toEqual([SCREEN_FILES.play]);
        expect(
            directImports('src/App.tsx', "import { AppFrame, type X } from './app/AppFrame.js';")
        ).toEqual([FRAME_FILE]);
        expect(
            directImports('src/screens.tsx', "import type { AppFrame } from './app/AppFrame.js';")
        ).toEqual([]);
        expect(
            directImports('src/app/round.tsx', "export { Flip7Keys } from './flip7-round.js';")
        ).toEqual([ENTRY_FILES['flip-7']]);
        expect(
            directImports('src/app/round.tsx', "export type { Flip7Keys } from './flip7-round.js';")
        ).toEqual([]);
    });
});
