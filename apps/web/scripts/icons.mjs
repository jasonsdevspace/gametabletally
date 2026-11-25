/**
 * Draws every icon the app serves from the mark's one source, `src/mark.ts`, into `public`.
 *
 *   npm run icons
 *
 * The favicon is the mark as an SVG, with an `.ico` beside it for browsers that read no SVG. The
 * apple touch icon and the install icons fill their square, for a phone to round itself, and the
 * maskable icon leaves room around the strokes for a phone's own shape. Each picture is drawn by
 * Chromium at its size. What they were drawn from is written beside this script, which a test holds
 * to the mark as it stands, so an icon not drawn again after a change fails the build's tests.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from '@playwright/test';

import { ICO_SIZES, ICONS, markSvg } from '../src/mark.ts';

const PUBLIC = fileURLToPath(new URL('../public', import.meta.url));

/** What every icon was drawn from, as the test reads it back. */
export const drawnFrom = () =>
    createHash('sha256')
        .update(JSON.stringify(ICONS.map((icon) => [icon, markSvg(icon)])))
        .digest('hex')
        .slice(0, 16);

/** An `.ico` holding the PNGs given, each with its size, as browsers read one. */
const icoOf = (pngs) => {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);
    header.writeUInt16LE(1, 2);
    header.writeUInt16LE(pngs.length, 4);
    let offset = 6 + 16 * pngs.length;
    const entries = pngs.map(({ size, png }) => {
        const entry = Buffer.alloc(16);
        entry.writeUInt8(size >= 256 ? 0 : size, 0);
        entry.writeUInt8(size >= 256 ? 0 : size, 1);
        entry.writeUInt16LE(1, 4);
        entry.writeUInt16LE(32, 6);
        entry.writeUInt32LE(png.length, 8);
        entry.writeUInt32LE(offset, 12);
        offset += png.length;
        return entry;
    });
    return Buffer.concat([header, ...entries, ...pngs.map(({ png }) => png)]);
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const browser = await chromium.launch();
    const page = await browser.newPage({ deviceScaleFactor: 1 });
    /** The mark drawn as a PNG at a size, with what lies outside its corners left clear. */
    const draw = async (svg, size) => {
        await page.setViewportSize({ width: size, height: size });
        await page.setContent(
            `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
        );
        return page.screenshot({ omitBackground: true, type: 'png' });
    };
    try {
        for (const icon of ICONS) {
            const path = join(PUBLIC, icon.file);
            mkdirSync(dirname(path), { recursive: true });
            const svg = markSvg(icon);
            writeFileSync(path, icon.size === null ? svg : await draw(svg, icon.size));
            console.log(`drew ${icon.file}`);
        }
        const favicon = markSvg({ corners: true, scale: 1 });
        const pngs = [];
        for (const size of ICO_SIZES) pngs.push({ size, png: await draw(favicon, size) });
        writeFileSync(join(PUBLIC, 'favicon.ico'), icoOf(pngs));
        console.log('drew favicon.ico');
        writeFileSync(
            fileURLToPath(new URL('icons-drawn.json', import.meta.url)),
            `${JSON.stringify({ source: drawnFrom() }, null, 4)}\n`
        );
    } finally {
        await browser.close();
    }
}
