import { THEME_KEY } from '@jasonsdevspace/design-kit/theme';

import { ROUTES } from '../src/routes.js';
import { expect, fontsReady, test } from './support.js';

/*
 * The app's look in a browser: the design kit's theme, DM Sans from the app's own files, the lip
 * on the kit's keys, and nothing asked of another origin.
 */

test('no page asks another origin for anything', async ({ page, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    const elsewhere: string[] = [];
    page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.protocol.startsWith('http') && url.origin !== origin) elsewhere.push(request.url());
    });
    for (const { path } of ROUTES) {
        await page.goto(path);
        await fontsReady(page);
    }
    await page.goto('/no-such-page/');
    await fontsReady(page);
    expect(elsewhere).toEqual([]);
});

test("draws its text in DM Sans, loaded from the app's own files", async ({ page, baseURL }) => {
    const fonts: string[] = [];
    page.on('request', (request) => {
        if (request.resourceType() === 'font') fonts.push(request.url());
    });
    await page.goto('/');
    await fontsReady(page);
    expect(await page.evaluate(() => document.fonts.check('16px "DM Sans"'))).toBe(true);
    expect(
        await page.evaluate(() => getComputedStyle(document.body).fontFamily.split(',')[0]?.trim())
    ).toMatch(/^"?DM Sans"?$/);
    expect(fonts).toEqual([new URL('/fonts/dm-sans-latin.woff2', baseURL).href]);
});

for (const theme of ['light', 'dark'] as const)
    test(`follows the theme chosen with the kit's switch, ${theme}, and paints the browser's bar to match`, async ({
        page,
    }) => {
        await page.addInitScript(
            ([key, value]) => {
                localStorage.setItem(key, value);
            },
            [THEME_KEY, theme] as const
        );
        await page.goto('/');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        const { bar, ground } = await page.evaluate(() => {
            // Each color read back through the page's own style, so both are written alike.
            const asDrawn = (color: string) => {
                const probe = document.createElement('i');
                probe.style.color = color;
                document.body.append(probe);
                const drawn = getComputedStyle(probe).color;
                probe.remove();
                return drawn;
            };
            const metas = [
                ...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]'),
            ];
            return {
                bar: [...new Set(metas.map((meta) => asDrawn(meta.content)))],
                ground: asDrawn(getComputedStyle(document.body).backgroundColor),
            };
        });
        expect(bar).toEqual([ground]);
    });

test("gives the kit's keys the lip, and a press moves a key straight down by its depth", async ({
    page,
}) => {
    await page.goto('/');
    const look = await page.evaluate(() => {
        const key = document.createElement('button');
        key.className = 'dk-button';
        key.textContent = 'Key';
        document.body.append(key);
        const style = getComputedStyle(key);
        const root = getComputedStyle(document.documentElement);
        const found = {
            shadow: style.boxShadow,
            press: root.getPropertyValue('--dk-button-press').trim(),
        };
        key.remove();
        return found;
    });
    expect(look.shadow).toMatch(/0px 2px 0px/);
    // Straight down, by the lip's depth.
    expect(look.press).toBe('0 2px');
});
