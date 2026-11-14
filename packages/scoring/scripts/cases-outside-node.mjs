/**
 * Runs every case against the built script inside QuickJS, a script runtime with none of
 * Node's globals and none of a browser's.
 *
 * The tests run the same cases against the source in Node. This run proves two things they
 * cannot: that the one script a phone's runtime loads holds the whole package, and that the
 * package needs nothing a bare engine lacks, such as `console`, timers or `Intl`. It proves
 * QuickJS, which is one such engine, and stands in for the others.
 *
 * Run with `npm run cases:outside-node`, after a build.
 */
import { deepStrictEqual } from 'node:assert';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import variant from '@jitl/quickjs-wasmfile-release-sync';
import { newQuickJSWASMModuleFromVariant } from 'quickjs-emscripten-core';

const HERE = fileURLToPath(new URL('..', import.meta.url));
const BUNDLE = join(HERE, 'dist', 'scoring.global.js');
const CASES = join(HERE, 'cases');

const quickjs = await newQuickJSWASMModuleFromVariant(variant);
const context = quickjs.newContext();

/**
 * Evaluates a script in the bare runtime and returns what it leaves, as plain data.
 *
 * @param {string} code
 * @param {string} name what the script is, for an error
 * @returns {unknown}
 */
const evaluate = (code, name) => {
    const result = context.evalCode(code, name);
    // Every handle is let go, or the runtime refuses to shut down.
    if (result.error) {
        const error = context.dump(result.error);
        result.error.dispose();
        throw new Error(`${name} failed in the bare runtime: ${JSON.stringify(error)}`);
    }
    const value = context.dump(result.value);
    result.value.dispose();
    return value;
};

let ran = 0;
const failed = [];
try {
    evaluate(readFileSync(BUNDLE, 'utf8'), 'scoring.global.js');
    // Each game has a folder, and each version of its rule set a file in it.
    const files = readdirSync(CASES, { recursive: true, encoding: 'utf8' })
        .filter((name) => name.endsWith('.json'))
        .sort();
    for (const file of files) {
        /** @type {{ cases: { name: string, input?: unknown, text?: string, expect: unknown }[] }} */
        const { cases } = JSON.parse(readFileSync(join(CASES, file), 'utf8'));
        for (const { name, input, text, expect } of cases) {
            ran += 1;
            try {
                // The game goes in as text and is read inside the runtime, as a phone's app
                // hands one over, so a key such as `__proto__` is the key it is in the file.
                // A problem's sentence is an implementation's own wording, so a case holds its
                // code, its data and its place and never the sentence.
                const answer = evaluate(
                    `(() => {
                        const text = ${JSON.stringify(text ?? JSON.stringify(input))};
                        const { problems, ...rest } = JSON.parse(GameTableTallyScoring.scoreJson(text));
                        return JSON.stringify({
                            ...rest,
                            problems: problems.map(({ code, data, round, player }) => ({ code, data, round, player })),
                        });
                    })()`,
                    `${file}: ${name}`
                );
                deepStrictEqual(JSON.parse(String(answer)), expect);
            } catch (error) {
                // A case that throws in the runtime is one failure among the others, so the
                // rest still run and every failing case is named.
                failed.push(
                    `FAIL ${file}: ${name}\n${error instanceof Error ? error.message : String(error)}`
                );
            }
        }
    }
} finally {
    context.dispose();
}

if (ran === 0) failed.push('FAIL no cases were found to run');
for (const failure of failed) console.error(failure);
if (failed.length > 0) process.exit(1);
console.log('Every case passed against the built script in QuickJS.');
