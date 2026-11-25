import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * What the build wrote, read from the build's folder: each script by the address it is served at,
 * with the app's source files it holds, read from its source map.
 */

/** The build's folder. */
export const DIST = fileURLToPath(new URL('../dist', import.meta.url));

/** The app's folder, from which a source file is named, as `src/app/PlayStart.tsx`. */
const APP = fileURLToPath(new URL('..', import.meta.url));

/** Each built script by the address it is served at, with the source files it holds. */
export const builtScripts = (): ReadonlyMap<string, readonly string[]> => {
    const assets = join(DIST, 'assets');
    const scripts = new Map<string, readonly string[]>();
    for (const name of readdirSync(assets).filter((file) => file.endsWith('.js'))) {
        const map = join(assets, `${name}.map`);
        // The bundler's own runtime holds no source, and has no map.
        const read: unknown = existsSync(map) ? JSON.parse(readFileSync(map, 'utf8')) : {};
        const sources =
            typeof read === 'object' && read !== null && 'sources' in read ? read.sources : [];
        scripts.set(
            `/assets/${name}`,
            Array.isArray(sources)
                ? sources.map((source) => relative(APP, resolve(assets, String(source))))
                : []
        );
    }
    return scripts;
};

/** The address of the built script that holds a source file, or nothing. */
export const scriptHolding = (source: string): string | undefined =>
    [...builtScripts()].find(([, sources]) => sources.includes(source))?.[0];
