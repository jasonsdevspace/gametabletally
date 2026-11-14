import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { precacheOf } from './precache.mjs';

const builds: string[] = [];

/** A build folder holding the files given, by path. */
const buildOf = (files: Record<string, string>): string => {
    const dist = mkdtempSync(join(tmpdir(), 'precache-'));
    builds.push(dist);
    for (const [path, text] of Object.entries(files)) {
        mkdirSync(join(dist, path, '..'), { recursive: true });
        writeFileSync(join(dist, path), text);
    }
    return dist;
};

afterEach(() => {
    for (const dist of builds.splice(0)) rmSync(dist, { recursive: true });
});

describe('the precache list of a build', () => {
    it('lists every file but the worker itself', () => {
        const dist = buildOf({ 'index.html': 'a', 'about/index.html': 'b', 'sw.js': 'w' });
        expect(precacheOf(dist).files).toEqual(['/about/index.html', '/index.html']);
    });

    it('takes a new version when a file changes and keeps its name', () => {
        const before = precacheOf(buildOf({ 'index.html': 'a', 'manifest.webmanifest': '{}' }));
        const after = precacheOf(buildOf({ 'index.html': 'a', 'manifest.webmanifest': '{ }' }));
        expect(after.files).toEqual(before.files);
        expect(after.version).not.toBe(before.version);
    });

    it('keeps its version when nothing changes', () => {
        const files = { 'index.html': 'a', 'assets/app.js': 'b' };
        expect(precacheOf(buildOf(files)).version).toBe(precacheOf(buildOf(files)).version);
    });
});
