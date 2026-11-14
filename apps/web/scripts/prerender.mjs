/**
 * Writes each page of the app, drawn ahead of time, from the client build's one empty page.
 *
 * Runs after both builds. The client build writes `dist/index.html` with an empty root, and the
 * server build writes a module that draws each page. Each address gets a copy of the page with
 * its screen drawn into the root and its own title, at the path GitHub Pages serves it from, and
 * the not-found page is written as `404.html`, which Pages serves for any other path with a 404
 * status. So every address reads with no script, as it is deployed.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const EMPTY_ROOT = '<div id="root"></div>';
const TITLE = /<title>[^<]*<\/title>/;

const { prerender } = await import(pathToFileURL(resolve('dist-ssr', 'entry-server.js')).href);

const template = readFileSync(join('dist', 'index.html'), 'utf8');
// Exactly one of each, so a page that changes shape fails the build rather than shipping a page
// that was not drawn.
for (const [marker, found] of [
    [EMPTY_ROOT, template.split(EMPTY_ROOT).length - 1],
    ['<title>', (template.match(new RegExp(TITLE, 'g')) ?? []).length],
]) {
    if (found !== 1) throw new Error(`dist/index.html: expected one ${marker}, found ${found}`);
}

/** Text as it is written inside an element of a page. */
const escaped = (text) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

for (const { file, title, markup } of prerender()) {
    // Functions rather than strings, so a `$` in the markup is never read as a pattern.
    const html = template
        .replace(TITLE, () => `<title>${escaped(title)}</title>`)
        .replace(EMPTY_ROOT, () => `<div id="root">${markup}</div>`);
    const path = join('dist', file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, html);
    console.log(`prerendered ${path}, ${markup.length} characters`);
}
