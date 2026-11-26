/**
 * Pins the answers of every case in `cases` into `released`, a file for each rule set, so a test
 * holds each released answer to never changing under its version.
 *
 *   npm run pin-cases -w @gametabletally/scoring
 *
 * Every case not yet pinned is pinned, and an answer an addition changed is pinned again as it now
 * stands. A pinned answer that changed otherwise, a pinned case taken away, or a file of pins whose
 * cases are gone is named and nothing is written, since that change belongs in a new version.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { breaks, pinned } from './released.mjs';

const CASES = fileURLToPath(new URL('../cases', import.meta.url));
const RELEASED = fileURLToPath(new URL('../released', import.meta.url));

const files = readdirSync(CASES, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => relative(CASES, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();

const pinFiles = existsSync(RELEASED)
    ? readdirSync(RELEASED, { recursive: true, withFileTypes: true })
          .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
          .map((entry) =>
              relative(RELEASED, join(entry.parentPath, entry.name)).split(sep).join('/')
          )
    : [];
const found = pinFiles
    .filter((place) => !files.includes(place))
    .map((place) => `${place}: the cases of a released rule set are gone`);
const written = [];
for (const place of files) {
    const file = JSON.parse(readFileSync(join(CASES, place), 'utf8'));
    const at = join(RELEASED, place);
    const before = existsSync(at)
        ? JSON.parse(readFileSync(at, 'utf8'))
        : { game: file.game, rules: file.rules, answers: [] };
    found.push(...breaks(before, file).map((sentence) => `${place}: ${sentence}`));
    written.push([at, pinned(before, file)]);
}
if (found.length > 0) {
    console.error(
        `Nothing pinned. A released answer may only change in a new version:\n${found.join('\n')}`
    );
    process.exit(1);
}
for (const [at, pins] of written) {
    mkdirSync(dirname(at), { recursive: true });
    writeFileSync(at, `${JSON.stringify(pins, null, 4)}\n`);
}
console.log(`Pinned the cases of ${files.join(', ')}.`);
