/// <reference lib="webworker" />
import { answerFor, installCacheOf, readPrecache } from './answer.js';

/**
 * The service worker: the whole app, cached on the first visit, so every page opens again with no
 * connection.
 *
 * The app is small and has no server, so the worker caches every file of the build when it
 * installs, and answers every navigation from that cache, or with the app's own not-found page,
 * and never from the network. A page fetched fresh from a newer build would upgrade the phone's
 * database, and the next page from the cache would be the older build, refused by the database it
 * had just been using. A new worker installs and waits until a page asks it to take over, as the
 * visitor agrees to the new version the page offers, or until every page of the app the phone has
 * open is closed. Taking over, it serves every open page of the app and deletes the older build's
 * cache, so a page that did not ask says so and reloads into the new build.
 */

declare const self: ServiceWorkerGlobalScope;

// The build writes the list of its files here, with the version that names their cache.
const PRECACHE = readPrecache(JSON.parse('__GAME_TABLE_TALLY_PRECACHE__'));
const CACHE = `game-table-tally-${PRECACHE.version}`;
const FILES = new Set(PRECACHE.files);

self.addEventListener('install', (event) => {
    // Each page and unhashed file straight from the server, past the browser's own cache, which
    // could still hold a page of the build before and leave this worker caching two builds at once.
    // A hashed file can only be this build's, so the copy the page just loaded is used.
    event.waitUntil(
        caches
            .open(CACHE)
            .then((cache) =>
                cache.addAll(
                    PRECACHE.files.map((file) => new Request(file, { cache: installCacheOf(file) }))
                )
            )
    );
});

self.addEventListener('message', (event) => {
    if (event.data === 'take over') event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((names) =>
                Promise.all(
                    names
                        .filter((name) => name.startsWith('game-table-tally-') && name !== CACHE)
                        .map((name) => caches.delete(name))
                )
            )
            .then(() => self.clients.claim())
    );
});

/** A cached file, or a plain refusal where the cache has lost it, never the network. */
const cached = async (file: string, status = 200): Promise<Response> => {
    const hit = await caches.match(file, { cacheName: CACHE });
    if (!hit) return new Response('This page is not saved on this phone.', { status: 504 });
    return status === hit.status
        ? hit
        : new Response(hit.body, { status, statusText: 'Not Found', headers: hit.headers });
};

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin) return;
    if (request.mode === 'navigate') {
        const answer = answerFor(url.pathname, FILES);
        event.respondWith(
            answer.kind === 'redirect'
                ? Promise.resolve(Response.redirect(`${answer.path}${url.search}`, 301))
                : cached(answer.file, answer.kind === 'page' ? 200 : 404)
        );
        return;
    }
    // A file of the build from the cache, a page asked for by its address among them, as a
    // prefetch asks. Anything else the page asks for goes to the network.
    const answer = answerFor(url.pathname, FILES);
    if (answer.kind === 'page') event.respondWith(cached(answer.file));
});
