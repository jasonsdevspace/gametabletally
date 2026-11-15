import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { precacheOf } from '../scripts/precache.mjs';
import { readPrecache } from '../worker/answer.js';
import { expect, test } from './support.js';

/*
 * The build itself, read from the files: the manifest an install reads, and the list of files the
 * service worker caches, held to every file the build writes.
 */

const DIST = fileURLToPath(new URL('../dist', import.meta.url));

interface Icon {
    readonly src: string;
    readonly sizes: string;
    readonly purpose: string;
}

/** The icons a manifest lists, each read as an icon, or a failure where one is not. */
const iconsOf = (manifest: unknown): Icon[] => {
    const icons: unknown =
        typeof manifest === 'object' && manifest !== null ? Reflect.get(manifest, 'icons') : null;
    if (!Array.isArray(icons)) throw new Error('The manifest lists no icons.');
    return icons.map((icon: unknown) => {
        const field = (name: string): string => {
            const value: unknown =
                typeof icon === 'object' && icon !== null ? Reflect.get(icon, name) : null;
            if (typeof value !== 'string') throw new Error(`An icon has no ${name}.`);
            return value;
        };
        return { src: field('src'), sizes: field('sizes'), purpose: field('purpose') };
    });
};

/** A PNG's width and height, read from its header. */
const sizeOf = (file: string): readonly [number, number] => {
    const png = readFileSync(join(DIST, file));
    expect(png.subarray(12, 16).toString('ascii'), file).toBe('IHDR');
    return [png.readUInt32BE(16), png.readUInt32BE(20)];
};

test('the manifest names the app, its start, standalone display, its colors and its icons', () => {
    const manifest: unknown = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8'));
    expect(manifest).toMatchObject({
        name: 'Game Table Tally',
        short_name: 'Table Tally',
        start_url: '/play/',
        scope: '/',
        display: 'standalone',
        theme_color: expect.stringMatching(/^#[0-9a-f]{6}$/),
        background_color: expect.stringMatching(/^#[0-9a-f]{6}$/),
    });
    const icons = iconsOf(manifest);
    for (const size of [192, 512]) {
        const icon = icons.find((one) => one.sizes === `${size}x${size}` && one.purpose === 'any');
        expect(icon, `an icon at ${size}`).toBeDefined();
        expect(sizeOf(icon?.src ?? '')).toEqual([size, size]);
    }
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    // The start address is one the app builds.
    expect(readdirSync(join(DIST, 'play'))).toContain('index.html');
});

test("every file in the build is in the service worker's list", () => {
    const files = readdirSync(DIST, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map(
            (entry) => `/${relative(DIST, join(entry.parentPath, entry.name)).split(sep).join('/')}`
        )
        .filter((path) => path !== '/sw.js' && !path.endsWith('.map'));
    const worker = readFileSync(join(DIST, 'sw.js'), 'utf8');
    const embedded = /JSON\.parse\(("(?:[^"\\]|\\.)*")\)/.exec(worker)?.[1];
    expect(embedded, 'the list in the worker').toBeDefined();
    const text: unknown = JSON.parse(embedded ?? '""');
    if (typeof text !== 'string') throw new Error('The worker holds no list as text.');
    const { files: listed, version } = readPrecache(JSON.parse(text));
    expect([...listed].sort()).toEqual([...files].sort());
    // A list written before the last file changed would name an older cache.
    expect(version).toBe(precacheOf(DIST).version);
    expect(files.length).toBeGreaterThan(0);
});

/** Every file the worker caches, read from the worker the build wrote. */
const listedFiles = (): readonly string[] => {
    const worker = readFileSync(join(DIST, 'sw.js'), 'utf8');
    const embedded = /JSON\.parse\(("(?:[^"\\]|\\.)*")\)/.exec(worker)?.[1] ?? '""';
    const text: unknown = JSON.parse(embedded);
    if (typeof text !== 'string') throw new Error('The worker holds no list as text.');
    return readPrecache(JSON.parse(text)).files;
};

test('the worker caches every file a page asks for, and each is served, as its install fetches it', async ({
    request,
}) => {
    const listed = new Set(listedFiles());
    for (const file of listed) {
        const response = await request.get(file);
        expect(response.status(), file).toBe(200);
    }
    // Each page's own files, read from the page rather than from a walk of the folder.
    for (const page of [...listed].filter((file) => file.endsWith('.html'))) {
        const html = readFileSync(join(DIST, page), 'utf8');
        for (const [, path] of html.matchAll(/(?:src|href)="(\/[^"#?]*)"/g)) {
            // A link to another page asks for that page's own file.
            const file = path?.endsWith('/') ? `${path}index.html` : path;
            if (file) expect(listed.has(file), `${page} asks for ${path}`).toBe(true);
        }
    }
});

test('every page carries each tag an install reads once', () => {
    for (const page of listedFiles().filter((file) => file.endsWith('.html'))) {
        const html = readFileSync(join(DIST, page), 'utf8');
        for (const tag of [
            /<link rel="manifest"/g,
            /<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: light\)"/g,
            /<meta name="theme-color" content="#[0-9a-f]{6}" media="\(prefers-color-scheme: dark\)"/g,
            /<link rel="icon"/g,
            /<link rel="apple-touch-icon"/g,
            /<meta name="viewport"/g,
        ])
            expect(html.match(tag)?.length ?? 0, `${page} ${tag.source}`).toBe(1);
        // One color for the browser's bar in each theme, and no other.
        expect(html.match(/<meta name="theme-color"/g)?.length ?? 0, page).toBe(2);
    }
});
