/**
 * Serves the built app as GitHub Pages does, for the browser tests and the Lighthouse audit.
 *
 *   node scripts/serve.mjs [port]
 *
 * A path ending in a slash serves the folder's `index.html`, a folder asked for without its
 * slash is sent to the path with it, a file is served as it is, and anything else is answered
 * with `404.html` and a 404 status. Text is sent compressed, and every file found may be kept by
 * the browser for as long as Pages lets it, so what a test or an audit measures is what a visitor
 * downloads. Vite's own preview answers an unknown path with the start page instead, which would
 * hide a page that was not built.
 */
import { execFileSync } from 'node:child_process';
import { createReadStream, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { createSecureServer } from 'node:http2';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
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
    '.txt': 'text/plain; charset=utf-8',
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
const COMPRESSED = new Set([
    '.html',
    '.js',
    '.css',
    '.json',
    '.map',
    '.svg',
    '.webmanifest',
    '.txt',
]);

/** How long Pages lets a browser keep any file before asking again, in seconds. */
const MAX_AGE = 600;

const send = (request, response, status, file) => {
    const type = TYPES[extname(file)] ?? 'application/octet-stream';
    const gzip =
        COMPRESSED.has(extname(file)) && /\bgzip\b/.test(request.headers['accept-encoding'] ?? '');
    let modified;
    try {
        modified = statSync(file).mtime;
    } catch {
        response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end(`The build has no ${file}.`);
        return;
    }
    // A file found may be kept for as long as Pages lets it, and a browser that asks whether it
    // changed since is told it has not, as Pages tells it. A 404 carries neither, as on Pages.
    const found = status === 200;
    const since = Date.parse(request.headers['if-modified-since'] ?? '');
    if (found && since >= Math.floor(modified.getTime() / 1000) * 1000) {
        response.writeHead(304, { 'Cache-Control': `max-age=${MAX_AGE}` });
        response.end();
        return;
    }
    response.writeHead(status, {
        'Content-Type': type,
        Vary: 'Accept-Encoding',
        ...(found
            ? { 'Cache-Control': `max-age=${MAX_AGE}`, 'Last-Modified': modified.toUTCString() }
            : {}),
        ...(gzip ? { 'Content-Encoding': 'gzip' } : {}),
    });
    const stream = createReadStream(file);
    (gzip ? stream.pipe(createGzip()) : stream).pipe(response);
};

/**
 * A certificate for localhost made for this run alone, so the server can speak HTTP/2, which a
 * browser speaks only over TLS, as Pages does. It is made by OpenSSL and thrown away at once.
 */
const certificate = () => {
    const folder = mkdtempSync(join(tmpdir(), 'serve-'));
    const key = join(folder, 'key.pem');
    const cert = join(folder, 'cert.pem');
    try {
        execFileSync(
            'openssl',
            [
                ...['req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:prime256v1'],
                ...['-nodes', '-keyout', key, '-out', cert, '-days', '1'],
                ...['-subj', '/CN=localhost', '-addext', 'subjectAltName=DNS:localhost'],
            ],
            // OpenSSL's own words reach the error where it fails.
            { stdio: ['ignore', 'ignore', 'pipe'] }
        );
        return { key: readFileSync(key), cert: readFileSync(cert) };
    } catch (error) {
        const said = error instanceof Error && 'stderr' in error ? String(error.stderr) : '';
        throw new Error(`OpenSSL could not make a certificate for localhost. ${said}`.trim(), {
            cause: error,
        });
    } finally {
        rmSync(folder, { recursive: true, force: true });
    }
};

/**
 * Starts the server on a port, and resolves to its address and a way to stop it once it listens.
 * Asked to be secure, it serves HTTP/2 over TLS with a certificate made for the run, as Pages
 * serves the live site, for a browser told to accept that certificate.
 */
export const serve = (port, { secure = false } = {}) =>
    new Promise((ready) => {
        const answer = (request, response) => {
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
            if (file !== ROOT && !file.startsWith(`${ROOT}${sep}`)) {
                send(request, response, 404, join(ROOT, '404.html'));
                return;
            }
            const kind = kindOf(file);
            if (kind === 'folder' && !path.endsWith('/')) {
                // The address as it was asked for, still encoded, so no decoded slash or
                // character can turn it into an address elsewhere.
                response.writeHead(301, { Location: `${url.pathname}/${url.search}` });
                response.end();
            } else if (kind === 'folder' && kindOf(join(file, 'index.html')) === 'file') {
                send(request, response, 200, join(file, 'index.html'));
            } else if (kind === 'file') {
                send(request, response, 200, file);
            } else {
                send(request, response, 404, join(ROOT, '404.html'));
            }
        };
        const server = secure
            ? createSecureServer({ ...certificate(), allowHTTP1: true }, answer)
            : createServer(answer);
        // A browser keeps its connections open, and a server waits for those to end before it
        // closes, so they are ended first.
        const open = new Set();
        server.on(secure ? 'secureConnection' : 'connection', (connection) => {
            open.add(connection);
            connection.on('close', () => open.delete(connection));
        });
        server.listen(port, () => {
            ready({
                origin: `${secure ? 'https' : 'http'}://localhost:${port}`,
                stop: () =>
                    new Promise((done) => {
                        server.close(done);
                        for (const connection of open) connection.destroy();
                    }),
            });
        });
    });

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const { origin } = await serve(Number(process.argv[2] ?? 4180));
    console.log(`Serving the built app at ${origin}`);
}
