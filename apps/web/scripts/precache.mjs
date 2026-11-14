/**
 * Writes the list of every file in the build into the service worker, with a version taken from
 * what the files hold, so each build's worker caches the whole app and a changed build is a new
 * worker.
 *
 * Runs last, once the pages and the worker are written. Every file in the build is listed but the
 * worker itself, so no page that opened once fails to open offline for want of a file.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const DIST = 'dist';
const WORKER = join(DIST, 'sw.js');
const TOKEN = /(['"])__GAME_TABLE_TALLY_PRECACHE__\1/g;

const files = readdirSync(DIST, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => `/${relative(DIST, join(entry.parentPath, entry.name)).split(sep).join('/')}`)
    .filter((path) => path !== '/sw.js')
    .sort();

const hash = createHash('sha256');
for (const file of files) hash.update(file).update(readFileSync(join(DIST, file)));
const version = hash.digest('hex').slice(0, 12);

const worker = readFileSync(WORKER, 'utf8');
const found = worker.match(TOKEN)?.length ?? 0;
// Exactly one, so a worker that changes shape fails the build rather than caching nothing.
if (found !== 1) throw new Error(`${WORKER}: expected one place for the file list, found ${found}`);
// A function rather than a string, so a `$` in the list is never read as a pattern.
writeFileSync(
    WORKER,
    worker.replace(TOKEN, () => JSON.stringify(JSON.stringify({ version, files })))
);
console.log(`wrote ${files.length} files into ${WORKER}, version ${version}`);
