/**
 * Serves the built app as GitHub Pages does, for the browser tests and the Lighthouse audit.
 *
 *   node scripts/serve.mjs [port]
 *
 * A path ending in a slash serves the folder's `index.html`, a folder asked for without its
 * slash is sent to the path with it, a file is served as it is, and anything else is answered
 * with `404.html` and a 404 status. Text is sent compressed, as Pages sends it, so what a test or
 * an audit measures is what a visitor downloads. Vite's own preview answers an unknown path with the start
 * page instead, which would hide a page that was not built.
 */
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip } from 'node:zlib';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)), 'dist');

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.map': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
    '.woff2': 'font/woff2',
};

/** What sits at a path under the build, or null when nothing does. */
const kindOf = (path) => {
    try {
        const stat = statSync(path);
        return stat.isDirectory() ? 'folder' : 'file';
    } catch {
        return null;
    }
};

/** Text that Pages sends compressed when the browser accepts it, as every browser does. */
const COMPRESSED = new Set(['.html', '.js', '.css', '.json', '.map', '.svg', '.webmanifest']);

const send = (request, response, status, file) => {
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const gzip =
        COMPRESSED.has(extname(file)) && /\bgzip\b/.test(request.headers['accept-encoding'] ?? '');
    response.writeHead(status, {
        'Content-Type': type,
        Vary: 'Accept-Encoding',
        ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
    });
    const stream = createReadStream(file);
    (gzip ? stream.pipe(createGzip()) : stream).pipe(response);
};

/** Starts the server on a port, and resolves to a way to stop it once it listens. */
export const serve = (port) =>
    new Promise((ready) => {
        const server = createServer((request, response) => {
            const url = new URL(request.url ?? '/', 'http://localhost');
            let path;
            try {
                path = decodeURIComponent(url.pathname);
            } catch {
                send(request, response, 404, join(ROOT, '404.html'));
                return;
            }
            const file = normalize(join(ROOT, path));
            // Nothing outside the build is served, whatever the path asks for.
            if (!file.startsWith(ROOT)) {
                send(request, response, 404, join(ROOT, '404.html'));
                return;
            }
            const kind = kindOf(file);
            if (kind === 'folder' && !path.endsWith('/')) {
                response.writeHead(301, { Location: `${path}/${url.search}` });
                response.end();
            } else if (kind === 'folder' && kindOf(join(file, 'index.html')) === 'file') {
                send(request, response, 200, join(file, 'index.html'));
            } else if (kind === 'file') {
                send(request, response, 200, file);
            } else {
                send(request, response, 404, join(ROOT, '404.html'));
            }
        });
        server.listen(port, () => {
            ready({
                origin: `http://localhost:${port}`,
                // A browser keeps its connections open, and a server waits for those to end
                // before it closes, so they are ended first.
                stop: () =>
                    new Promise((done) => {
                        server.close(done);
                        server.closeAllConnections();
                    }),
            });
        });
    });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const { origin } = await serve(Number(process.argv[2] ?? 4180));
    console.log(`Serving the built app at ${origin}`);
}
