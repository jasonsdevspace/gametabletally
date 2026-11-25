/**
 * Which cached file answers a navigation, and how the install fetches each file, worked out from
 * the path alone, so the service worker's choices are plain functions a unit test holds.
 *
 * It answers as GitHub Pages does: a path ending in a slash is its folder's `index.html`, a file
 * is itself, a folder asked for without its slash is sent to the path with it, and anything else
 * is the not-found page.
 */

/** The file the build writes for any address that is not one. */
export const NOT_FOUND = '/404.html';

/** What a navigation is answered with. */
export type Answer =
    | { readonly kind: 'page'; readonly file: string }
    | { readonly kind: 'redirect'; readonly path: string }
    | { readonly kind: 'not-found'; readonly file: typeof NOT_FOUND };

/** The answer to a navigation to a path, from the files the worker holds. */
export const answerFor = (path: string, files: ReadonlySet<string>): Answer => {
    const asFile = path.endsWith('/') ? `${path}index.html` : path;
    if (files.has(asFile)) return { kind: 'page', file: asFile };
    if (!path.endsWith('/') && files.has(`${path}/index.html`))
        return { kind: 'redirect', path: `${path}/` };
    return { kind: 'not-found', file: NOT_FOUND };
};

/**
 * A file the build named by a hash of its content, which no other build's file can share, so a copy
 * the browser kept from the page that just loaded it is this build's own.
 */
const HASHED = /^\/assets\/[^/]+-[\w-]{8}\.\w+$/;

/**
 * How the worker's install fetches a file: a hashed file from the browser's own cache where the page
 * has just loaded it, so the install never downloads it twice, and every other file straight from
 * the server, past a cache that could still hold the page of the build before.
 */
export const installCacheOf = (file: string): 'default' | 'reload' =>
    HASHED.test(file) ? 'default' : 'reload';

/** The list of files a build's worker caches, and the version that names its cache. */
export interface Precache {
    readonly version: string;
    readonly files: readonly string[];
}

/** Reads the list the build wrote into the worker, or throws when it is not one. */
export const readPrecache = (raw: unknown): Precache => {
    if (typeof raw !== 'object' || raw === null) throw new Error('The worker holds no file list.');
    const version: unknown = Reflect.get(raw, 'version');
    const files: unknown = Reflect.get(raw, 'files');
    if (typeof version !== 'string' || !Array.isArray(files))
        throw new Error('The worker holds no file list.');
    const paths = files.filter((file): file is string => typeof file === 'string');
    if (paths.length !== files.length) throw new Error('The worker holds no file list.');
    return { version, files: paths };
};
