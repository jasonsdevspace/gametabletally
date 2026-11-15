import { GAMES } from '@gametabletally/scoring';
import tokens from '@jasonsdevspace/design-kit/tokens.css?raw';
import { describe, expect, it } from 'vitest';

import page from '../../index.html?raw';

/** Every sheet the app writes, as text. */
const sheets = import.meta.glob<string>('../**/*.css', {
    query: '?raw',
    import: 'default',
    eager: true,
});
const sheet = Object.values(sheets).join('\n');

/*
 * The app's sheets over the design kit: they set no kit color role and name no kit class, their
 * lip reaches the kit's keys by the kit's own properties, and their tile grounds and lip hold up
 * in both themes.
 */

/** The sheet with its comments taken out, so a word in a comment is never read as a rule. */
const rules = sheet.replace(/\/\*[\s\S]*?\*\//g, '');

/** Each custom property a sheet declares, with its value. */
const declared = (css: string): Map<string, string> =>
    new Map(
        [...css.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)].map(([, name = '', value = '']) => [
            name,
            value.trim(),
        ])
    );

const kit = declared(tokens.replace(/\/\*[\s\S]*?\*\//g, ''));
const app = declared(rules);

/** Whether a kit token holds a color. */
const isColor = (value: string): boolean =>
    /light-dark\(|#[0-9a-f]{3,8}\b|oklch\(|rgb|hsl/i.test(value);

/** The light and the dark value of a light-dark() pair, read flat. */
const pair = (value: string): readonly [string, string] => {
    const inner = /^light-dark\(([\s\S]*)\)$/.exec(value.replace(/\s+/g, ' ').trim())?.[1] ?? '';
    let depth = 0;
    for (let at = 0; at < inner.length; at += 1) {
        const char = inner[at];
        if (char === '(') depth += 1;
        if (char === ')') depth -= 1;
        if (char === ',' && depth === 0)
            return [inner.slice(0, at).trim(), inner.slice(at + 1).trim()];
    }
    throw new Error(`${value} is not a light-dark() pair`);
};

/** A color's linear red, green and blue and its alpha, from hex, rgb or oklch. */
const linear = (color: string): readonly [number, number, number, number] => {
    const hex = /^#([0-9a-f]{6})$/i.exec(color)?.[1];
    if (hex) {
        const channel = (at: number) => {
            const value = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        };
        return [channel(0), channel(2), channel(4), 1];
    }
    const rgb = /^rgb\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/.exec(color);
    if (rgb) {
        const channel = (value: number) => {
            const v = value / 255;
            return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
        };
        return [
            channel(Number(rgb[1])),
            channel(Number(rgb[2])),
            channel(Number(rgb[3])),
            Number(rgb[4] ?? 1),
        ];
    }
    const ok = /^oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)$/.exec(color);
    if (!ok) throw new Error(`${color} is not a color this test reads`);
    const [l, c, h, alpha] = [
        Number(ok[1]),
        Number(ok[2]),
        (Number(ok[3]) * Math.PI) / 180,
        Number(ok[4] ?? 1),
    ];
    const a = c * Math.cos(h);
    const b = c * Math.sin(h);
    const lms = [
        l + 0.3963377774 * a + 0.2158037573 * b,
        l - 0.1055613458 * a - 0.0638541728 * b,
        l - 0.0894841775 * a - 1.291485548 * b,
    ].map((v) => v ** 3);
    const [L = 0, M = 0, S = 0] = lms;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return [
        clamp(4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S),
        clamp(-1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S),
        clamp(-0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S),
        alpha,
    ];
};

/** A color's relative luminance, by WCAG, laid over a ground where it is see-through. */
const luminance = (color: string, over = '#ffffff'): number => {
    const [r, g, b, alpha] = linear(color);
    const [gr, gg, gb] = linear(over);
    const mix = (top: number, bottom: number) => top * alpha + bottom * (1 - alpha);
    return 0.2126 * mix(r, gr) + 0.7152 * mix(g, gg) + 0.0722 * mix(b, gb);
};

const contrast = (one: string, two: string): number => {
    const [high, low] = [luminance(one), luminance(two)].sort((x, y) => y - x);
    return ((high ?? 0) + 0.05) / ((low ?? 0) + 0.05);
};

describe("the app's sheet over the design kit", () => {
    it('sets no kit color role, nor any kit property but the typeface and the two for the lip', () => {
        expect(Object.keys(sheets).length).toBeGreaterThan(0);
        expect([...app.keys()].filter((name) => name.startsWith('--dk-')).sort()).toEqual([
            '--dk-button-press',
            '--dk-button-shadow',
            '--dk-font-sans',
        ]);
        const colorRoles = [...kit].filter(([, value]) => isColor(value)).map(([name]) => name);
        expect(colorRoles.length).toBeGreaterThan(10);
    });

    it("names the browser's bar on the kit's own ground in each theme", () => {
        const [light, dark] = pair(kit.get('--dk-bg') ?? '');
        const bar = (scheme: string) =>
            new RegExp(
                `<meta name="theme-color" content="([^"]+)" media="\\(prefers-color-scheme: ${scheme}\\)"`
            ).exec(page)?.[1];
        expect([bar('light'), bar('dark')]).toEqual([light, dark]);
    });

    it('sets DM Sans with a fallback face sized to it, so the page does not move as it arrives', () => {
        expect(app.get('--dk-font-sans')).toMatch(/^'DM Sans',\s*'DM Sans Fallback',/);
        expect(rules).toMatch(
            /font-family: 'DM Sans Fallback';[^}]*size-adjust: [\d.]+%;[^}]*ascent-override/
        );
    });

    it('names no kit class in any rule', () => {
        expect(rules.match(/\.dk-[a-z-]+/g) ?? []).toEqual([]);
    });

    it("sets DM Sans on the kit's sans role, from the app's own files", () => {
        expect(app.get('--dk-font-sans')).toMatch(/^'DM Sans',/);
        expect(rules).toMatch(/src: url\('\/fonts\/dm-sans-latin\.woff2'\) format\('woff2'\)/);
        expect(app.has('--dk-font-mono')).toBe(false);
    });

    it("gives the lip to the kit's keys by the kit's own properties, and a press by its depth", () => {
        expect(app.get('--dk-button-shadow')).toBe('var(--gtt-lip)');
        expect(app.get('--dk-button-press')).toBe('0 var(--gtt-lip-depth)');
        expect(kit.has('--dk-button-shadow') || tokens.includes('--dk-button-shadow')).toBe(false);
    });

    it.each(['--dk-bg', '--dk-surface', '--dk-raised'])(
        'draws the lip darker than the %s ground in each theme, and still to be seen there',
        (ground) => {
            const [lightLip, darkLip] = pair(app.get('--gtt-lip-color') ?? '');
            const [light, dark] = pair(kit.get(ground) ?? '');
            for (const [lip, under] of [
                [lightLip, light],
                [darkLip, dark],
            ] as const) {
                const shadowed = luminance(lip, under);
                expect(shadowed).toBeLessThan(luminance(under));
                expect((luminance(under) + 0.05) / (shadowed + 0.05)).toBeGreaterThanOrEqual(1.05);
            }
        }
    );

    /** The ground each game's tile is drawn on, by the game's id, from the rules that set it. */
    const grounds = new Map(
        [
            ...rules.matchAll(
                /\.gtt-tile\[data-game='([a-z0-9-]+)'\]\s*\{[^}]*background:\s*var\((--[a-z0-9-]+)\)/g
            ),
        ].map(([, id = '', ground = '']) => [id, ground])
    );

    it('draws every game the scoring package knows on a tile ground of its own', () => {
        expect([...grounds.keys()].sort()).toEqual(GAMES.map((game) => game.id).sort());
        expect(new Set(grounds.values()).size).toBe(grounds.size);
    });

    it.each(GAMES.map((game) => [game.name, game.id] as const))(
        "holds the text on %s's tile to WCAG AA in both themes",
        (_, id) => {
            const ground = grounds.get(id) ?? '';
            const [light, dark] = pair(app.get(ground) ?? kit.get(ground) ?? '');
            const [lightText, darkText] = pair(kit.get('--dk-fg') ?? '');
            const [lightMuted, darkMuted] = pair(kit.get('--dk-muted') ?? '');
            expect(contrast(light, lightText)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(dark, darkText)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(light, lightMuted)).toBeGreaterThanOrEqual(4.5);
            expect(contrast(dark, darkMuted)).toBeGreaterThanOrEqual(4.5);
        }
    );

    it("keeps the website's bands clear of a notch or a rounded corner on each side", () => {
        expect(app.get('--gtt-inset-left')).toMatch(/^calc\(\s*max\(var\(--dk-safe-left\),/);
        expect(app.get('--gtt-inset-right')).toMatch(/^calc\(\s*max\(var\(--dk-safe-right\),/);
    });

    it('gives every mark the sheet draws itself no words for a screen reader', () => {
        const blocks = [...rules.matchAll(/\{([^{}]*(?<![\w-])content:[^{}]*)\}/g)].map(
            ([, body = '']) => body
        );
        expect(blocks.length).toBeGreaterThan(0);
        for (const body of blocks) expect(body).toMatch(/(?<![\w-])content:[^;]*\/\s*'';/);
    });
});
