/**
 * Writes each page of the app, drawn ahead of time, from the client build's one empty page.
 *
 * Runs after both builds. The client build writes `dist/index.html` with an empty root, and the
 * server build writes a module that draws each page. Each address gets a copy of the page with
 * its screen drawn into the root and its own title, at the path GitHub Pages serves it from, and
 * the not-found page is written as `404.html`, which Pages serves for any other path with a 404
 * status. So every address reads with no script, as it is deployed.
 *
 * Each page also has the browser fetch its own files, the app's frame for a screen of the app and
 * the screen's own, with the files they import, beside the shell, so the screen arrives with the
 * shell rather than after it. The files are read
 * from the client build's manifest, which is removed once the pages are written, since no page
 * fetches it.
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const EMPTY_ROOT = '<div id="root"></div>';
const TITLE = /<title>[^<]*<\/title>/;
const HEAD_END = '</head>';
const MANIFEST = join('dist', '.vite', 'manifest.json');

const { prerender } = await import(pathToFileURL(resolve('dist-ssr', 'entry-server.js')).href);

const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));

/** The files the shell fetches already: its own and every file it imports, however deep. */
const fetchedBy = (key, seen = new Set()) => {
    const chunk = manifest[key];
    if (!chunk || seen.has(chunk.file)) return seen;
    seen.add(chunk.file);
    for (const imported of chunk.imports ?? []) fetchedBy(imported, seen);
    return seen;
};
const shell = fetchedBy('index.html');

/**
 * The built file each source file went into, read from each file's source map, since a source the
 * build put in a shared file has no entry of its own in the manifest.
 */
const fileOfSource = new Map();
for (const { file } of Object.values(manifest)) {
    // The bundler's own runtime is no source's, and has no map.
    if (!file.endsWith('.js') || !existsSync(join('dist', `${file}.map`))) continue;
    const { sources } = JSON.parse(readFileSync(join('dist', `${file}.map`), 'utf8'));
    for (const source of sources) fileOfSource.set(resolve('dist', dirname(file), source), file);
}

/** The manifest's key for a built file, which lists the files it imports. */
const keyOfFile = new Map(Object.entries(manifest).map(([key, { file }]) => [file, key]));

/** The links that fetch a page's own files and the files they import, leaving out the shell's. */
const preloadsOf = (sources) => {
    const files = new Set();
    for (const source of sources) {
        const file = fileOfSource.get(resolve(source));
        if (!file) throw new Error(`${MANIFEST}: ${source} is in no file of the build`);
        fetchedBy(keyOfFile.get(file), files);
    }
    return [...files]
        .filter((file) => !shell.has(file))
        .map((file) => `<link rel="modulepreload" crossorigin href="/${file}">`)
        .join('');
};

const template = readFileSync(join('dist', 'index.html'), 'utf8');
// Exactly one of each, so a page that changes shape fails the build rather than shipping a page
// that was not drawn.
for (const [marker, found] of [
    [EMPTY_ROOT, template.split(EMPTY_ROOT).length - 1],
    [HEAD_END, template.split(HEAD_END).length - 1],
    ['<title>', (template.match(new RegExp(TITLE, 'g')) ?? []).length],
]) {
    if (found !== 1) throw new Error(`dist/index.html: expected one ${marker}, found ${found}`);
}

/** Text as it is written inside an element of a page. */
const escaped = (text) =>
    text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

for (const { file, title, markup, files } of await prerender()) {
    // Functions rather than strings, so a `$` in the markup is never read as a pattern.
    const html = template
        .replace(TITLE, () => `<title>${escaped(title)}</title>`)
        .replace(HEAD_END, () => `${preloadsOf(files)}${HEAD_END}`)
        .replace(EMPTY_ROOT, () => `<div id="root">${markup}</div>`);
    const path = join('dist', file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, html);
    console.log(`prerendered ${path}, ${markup.length} characters`);
}

rmSync(join('dist', '.vite'), { recursive: true, force: true });
