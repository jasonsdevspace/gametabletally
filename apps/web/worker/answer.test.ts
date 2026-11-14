import { describe, expect, it } from 'vitest';

import { answerFor, readPrecache } from './answer.js';

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
