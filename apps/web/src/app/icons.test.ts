import { describe, expect, it } from 'vitest';

/*
 * The app's icons are the kit's, which set their size by the text and their stroke by the kit's
 * own measure, so no icon in the app sets a width, a height or a stroke width of its own. The
 * app's mark, in the website's frame, is a drawing, not an icon, and keeps its own.
 */

const sources = import.meta.glob<string>(
    ['../**/*.tsx', '!../**/*.test.tsx', '!../website/Website.tsx'],
    {
        eager: true,
        query: '?raw',
        import: 'default',
    }
);

describe("the app's icons", () => {
    it('are the kit icon, with no size or stroke of their own', () => {
        const icons = Object.entries(sources).flatMap(([file, source]) =>
            [...source.matchAll(/<svg\b[^>]*>/g)].map(([tag]) => [file, tag] as const)
        );
        expect(icons.length).toBeGreaterThan(0);
        for (const [file, tag] of icons) {
            expect(tag, file).toMatch(/className="dk-icon"/);
            expect(tag, file).not.toMatch(/\b(?:width|height|style)=|\{\.\.\./);
        }
        // Nor does any part of a drawing set a stroke of its own.
        for (const [file, source] of Object.entries(sources))
            expect(source, file).not.toMatch(/\bstrokeWidth=/);
    });
});
