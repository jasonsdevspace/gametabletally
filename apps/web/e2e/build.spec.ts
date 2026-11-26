import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

import { drawnFrom } from '../scripts/icons.mjs';
import { precacheOf } from '../scripts/precache.mjs';
import { ICO_SIZES, ICONS, MARK, markSvg } from '../src/mark.js';
import { ENTRY_FILES, FRAME_FILE, OWN_FILES, SCREEN_FILES } from '../src/own-files.js';
import { inApp, NOT_FOUND_FILE, ROUTES } from '../src/routes.js';
import { installCacheOf, readPrecache } from '../worker/answer.js';
import { builtScripts, scriptHolding } from './built.js';
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
    const maskable = icons.find((icon) => icon.purpose === 'maskable');
    expect(maskable?.src).toBe('/icons/icon-maskable-512.png');
    expect(sizeOf(maskable?.src ?? '')).toEqual([512, 512]);
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

test('builds each font under /assets/ named by its hash, with only its license left in /fonts', () => {
    const files = listedFiles();
    for (const font of ['dm-sans-latin', 'instrument-serif-latin'])
        expect(
            files.filter((file) => new RegExp(`^/assets/${font}-[\\w-]{8}\\.woff2$`).test(file)),
            font
        ).toHaveLength(1);
    expect(files.filter((file) => file.startsWith('/fonts/'))).toEqual([
        '/fonts/dm-sans-OFL.txt',
        '/fonts/instrument-serif-OFL.txt',
    ]);
});

test("the worker's install takes from the browser's cache only the files the build named by their hash", () => {
    const files = listedFiles();
    expect(files.filter((file) => file.startsWith('/assets/')).length).toBeGreaterThan(0);
    for (const file of files)
        expect(installCacheOf(file), file).toBe(file.startsWith('/assets/') ? 'default' : 'reload');
    // A file copied from the public folder keeps its name, with no hash, so none sits in /assets/.
    expect(existsSync(fileURLToPath(new URL('../public/assets', import.meta.url)))).toBe(false);
});

test("draws every icon from the mark's source as it stands, at the size it is named by", () => {
    const drawn: unknown = JSON.parse(
        readFileSync(fileURLToPath(new URL('../scripts/icons-drawn.json', import.meta.url)), 'utf8')
    );
    // Drawn again after the mark last changed, by `npm run icons`.
    expect(drawn).toEqual({ source: drawnFrom() });
    // One blue: the mark's ground, the manifest's color and the kit's accent the header takes.
    const manifest: unknown = JSON.parse(readFileSync(join(DIST, 'manifest.webmanifest'), 'utf8'));
    expect(manifest).toMatchObject({ theme_color: MARK.ground });
    const kit = readFileSync(
        fileURLToPath(import.meta.resolve('@jasonsdevspace/design-kit/tokens.css')),
        'utf8'
    );
    expect(kit).toContain(`--dk-accent: light-dark(${MARK.ground},`);
    for (const icon of ICONS)
        if (icon.size === null)
            expect(readFileSync(join(DIST, icon.file), 'utf8'), icon.file).toBe(markSvg(icon));
        else expect(sizeOf(`/${icon.file}`), icon.file).toEqual([icon.size, icon.size]);
    // The favicon's .ico holds a PNG at each of its sizes, and nothing else.
    const ico = readFileSync(join(DIST, 'favicon.ico'));
    expect(ico.readUInt16LE(2)).toBe(1);
    const count = ico.readUInt16LE(4);
    const sizes = Array.from({ length: count }, (_, at) => {
        const entry = 6 + 16 * at;
        const png = ico.subarray(ico.readUInt32LE(entry + 12));
        expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
        return [ico.readUInt8(entry), png.readUInt32BE(16)];
    });
    expect(sizes).toEqual(ICO_SIZES.map((size) => [size, size]));
});

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
            /<link rel="icon" href="\/favicon\.ico" sizes="16x16 32x32 48x48"/g,
            /<link rel="icon" href="\/favicon\.svg" type="image\/svg\+xml"/g,
            /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png"/g,
            /<meta name="viewport"/g,
        ])
            expect(html.match(tag)?.length ?? 0, `${page} ${tag.source}`).toBe(1);
        // One color for the browser's bar in each theme, and no other.
        expect(html.match(/<meta name="theme-color"/g)?.length ?? 0, page).toBe(2);
    }
});

/*
 * Each screen's code loads when the screen is first opened, so the build writes each screen and
 * each game's round entry into a file of its own, and a page fetches the shell and its own code.
 */

/** The scripts a page fetches as it loads, by the addresses its tags name. */
const scriptsOfPage = (file: string): string[] =>
    [
        ...readFileSync(join(DIST, file), 'utf8').matchAll(
            /<(?:script|link)[^>]*(?:src|href)="(\/assets\/[^"]+\.js)"/g
        ),
    ].flatMap(([, path]) => (path ? [path] : []));

/** The source files a page's scripts hold. */
const sourcesOfPage = (file: string): Set<string> => {
    const scripts = builtScripts();
    return new Set(scriptsOfPage(file).flatMap((path) => scripts.get(path) ?? []));
};

const WEBSITE_SCREENS: readonly string[] = [
    SCREEN_FILES.start,
    SCREEN_FILES.about,
    SCREEN_FILES.install,
];

test("builds each screen and each game's round entry into a file of its own", () => {
    const scripts = builtScripts();
    for (const file of OWN_FILES) {
        const holder = scriptHolding(file);
        expect(holder, file).toBeDefined();
        const others = (scripts.get(holder ?? '') ?? []).filter(
            (source) => source !== file && (OWN_FILES.includes(source) || source === FRAME_FILE)
        );
        expect(others, file).toEqual([]);
    }
});

test('has each page fetch the shell and its own screen, and no other screen', () => {
    for (const route of ROUTES) {
        const page = route.path === '/' ? 'index.html' : `${route.path.slice(1)}index.html`;
        const sources = sourcesOfPage(page);
        const own = SCREEN_FILES[route.name];
        expect(sources.has(own), `${page} fetches ${own}`).toBe(true);
        for (const file of OWN_FILES.filter((other) => other !== own))
            expect(sources.has(file), `${page} fetches ${file}`).toBe(false);
        if (inApp(route)) {
            expect(sources.has(FRAME_FILE), `${page} fetches the app's frame`).toBe(true);
            for (const file of WEBSITE_SCREENS) expect(sources.has(file), page).toBe(false);
        } else {
            // The website's pages hold no part of the app's screens or its games. The about page
            // loads the store for its backup.
            const app = [...sources].filter((source) => /^src\/(?:app|play)\//.test(source));
            expect(app, `${page} fetches the app's code`).toEqual([]);
        }
    }
    const notFound = [...sourcesOfPage(NOT_FOUND_FILE)];
    expect(
        notFound.filter((source) => OWN_FILES.includes(source) || source === FRAME_FILE)
    ).toEqual([]);
});

/**
 * The most each file built on its own may send, compressed, in bytes: what the split build sent,
 * with room for the screen to grow. The parts the screens share are files of their own, which the
 * budgets for each page's first load hold.
 */
const FILE_BUDGET: Readonly<Record<string, number>> = {
    [SCREEN_FILES.start]: 1500,
    [SCREEN_FILES.about]: 4500,
    [SCREEN_FILES.install]: 1500,
    [SCREEN_FILES.play]: 1500,
    [SCREEN_FILES.new]: 3500,
    [SCREEN_FILES.game]: 1750,
    [SCREEN_FILES.scores]: 750,
    [SCREEN_FILES.recap]: 2000,
    [SCREEN_FILES.history]: 1000,
    [SCREEN_FILES.players]: 1250,
    [SCREEN_FILES.player]: 3000,
    [ENTRY_FILES['flip-7']]: 2500,
    [ENTRY_FILES.skyjo]: 5000,
    [ENTRY_FILES.wizard]: 8000,
    [FRAME_FILE]: 5000,
};

test('keeps each file built on its own to a budget of its own', () => {
    for (const [source, budget] of Object.entries(FILE_BUDGET)) {
        const path = scriptHolding(source);
        expect(path, source).toBeDefined();
        const size = gzipSync(readFileSync(join(DIST, path ?? ''))).length;
        expect(size, `${source} in ${path ?? ''}`).toBeLessThanOrEqual(budget);
    }
    // Every file built on its own has a budget.
    expect(Object.keys(FILE_BUDGET).sort()).toEqual([...OWN_FILES, FRAME_FILE].sort());
});
