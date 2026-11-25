import { describe, expect, it } from 'vitest';

import { answerFor, fetchForInstall, installCacheOf, readPrecache } from './answer.js';

const FILES = new Set(['/index.html', '/about/index.html', '/404.html', '/assets/app.js']);

describe('the answer to a navigation', () => {
    it('is the folder page for a path that ends in a slash', () => {
        expect(answerFor('/', FILES)).toEqual({ kind: 'page', file: '/index.html' });
        expect(answerFor('/about/', FILES)).toEqual({ kind: 'page', file: '/about/index.html' });
    });

    it('is the file itself for a file', () => {
        expect(answerFor('/about/index.html', FILES)).toEqual({
            kind: 'page',
            file: '/about/index.html',
        });
    });

    it('sends a folder asked for without its slash to the path with it, as Pages does', () => {
        expect(answerFor('/about', FILES)).toEqual({ kind: 'redirect', path: '/about/' });
    });

    it('is the not-found page for anything else', () => {
        expect(answerFor('/no-such-page/', FILES)).toEqual({
            kind: 'not-found',
            file: '/404.html',
        });
        expect(answerFor('/no-such-page', FILES)).toEqual({ kind: 'not-found', file: '/404.html' });
    });
});

describe('the file list the build writes into the worker', () => {
    it('is read when it is a version and a list of paths', () => {
        expect(readPrecache({ version: 'abc', files: ['/index.html'] })).toEqual({
            version: 'abc',
            files: ['/index.html'],
        });
    });

    it('is refused when it is anything else', () => {
        for (const raw of [null, 'x', { version: 1, files: [] }, { version: 'a', files: [1] }])
            expect(() => readPrecache(raw)).toThrow(/no file list/);
    });
});

describe('how the install fetches a file', () => {
    it("takes a file named by its content's hash from the browser's own cache", () => {
        expect(installCacheOf('/assets/index-Bitifb3N.js')).toBe('default');
        expect(installCacheOf('/assets/web-vzcrtIRC.css')).toBe('default');
        expect(installCacheOf('/assets/game-table-880-r2Siuwts.webp')).toBe('default');
    });

    it('takes every page and every file with no hash in its name from the server', () => {
        expect(installCacheOf('/index.html')).toBe('reload');
        expect(installCacheOf('/about/index.html')).toBe('reload');
        expect(installCacheOf('/manifest.webmanifest')).toBe('reload');
        expect(installCacheOf('/fonts/atkinson.woff2')).toBe('reload');
        expect(installCacheOf('/icons/icon-192.png')).toBe('reload');
        expect(installCacheOf('/assets/notes.txt')).toBe('reload');
    });
});

describe('a file fetched for the install', () => {
    /** A stand-in fetch that answers each request by its cache mode, recording what it was asked. */
    const answering = (byMode: Partial<Record<RequestCache, number>>) => {
        const asked: RequestCache[] = [];
        const get = (_file: string, cache: 'default' | 'reload') => {
            asked.push(cache);
            return Promise.resolve(new Response('', { status: byMode[cache] ?? 200 }));
        };
        return { asked, get };
    };

    it("is a hashed file from the browser's cache where the cache holds it", async () => {
        const { asked, get } = answering({ default: 200 });
        const response = await fetchForInstall('/assets/index-Bitifb3N.js', get);
        expect(response.status).toBe(200);
        expect(asked).toEqual(['default']);
    });

    it('is a hashed file from the server again where the cache answers with a failure', async () => {
        const { asked, get } = answering({ default: 404, reload: 200 });
        const response = await fetchForInstall('/assets/index-Bitifb3N.js', get);
        expect(response.status).toBe(200);
        expect(asked).toEqual(['default', 'reload']);
    });

    it('is a page from the server once, whatever it answers', async () => {
        const { asked, get } = answering({ reload: 404 });
        const response = await fetchForInstall('/index.html', get);
        expect(response.status).toBe(404);
        expect(asked).toEqual(['reload']);
    });
});
