import { describe, expect, it } from 'vitest';

/*
 * The app keeps one list of its addresses, in routes.ts. A screen that wrote an address of its own
 * would go unbuilt and untested, so no source file but that one writes a path as text.
 */

const sources = import.meta.glob<string>(
    ['./**/*.{ts,tsx}', '!./**/*.test.{ts,tsx}', '!./routes.ts'],
    {
        eager: true,
        query: '?raw',
        import: 'default',
    }
);

describe('the one list of addresses', () => {
    it('is the only place a path of the app is written', () => {
        const written = Object.entries(sources).flatMap(([file, source]) =>
            [...source.matchAll(/(?:href=|['"`])(\/[a-z-]+\/)/g)].map(
                (match) => `${file}: ${match[1] ?? ''}`
            )
        );
        expect(written).toEqual([]);
    });
});
