import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SOURCE_CONDITION } from '../source-condition.js';
import { workspacePackages } from './repository.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path: string): string => readFileSync(join(ROOT, path), 'utf8');

/**
 * The condition is written out wherever it cannot be imported. One copy spelled another way
 * would send that tool to a package's build, which may be stale or missing, with nothing said.
 */
describe('the source condition', () => {
    const packages = workspacePackages(ROOT);

    it('is the one name every type check asks for', () => {
        for (const path of packages) {
            const asked = /"customConditions":\s*\[([^\]]*)\]/.exec(read(`${path}/tsconfig.json`));
            expect(asked?.[1]?.trim(), path).toBe(JSON.stringify(SOURCE_CONDITION));
        }
    });

    it('is the name a package offers its source under, when it offers one', () => {
        const offered = packages.flatMap((path) =>
            [...read(`${path}/package.json`).matchAll(/"(@[^"]*\/source)":/g)].map(
                (found) => found[1]
            )
        );
        expect(offered).not.toEqual([]);
        expect(new Set(offered)).toEqual(new Set([SOURCE_CONDITION]));
    });
});
