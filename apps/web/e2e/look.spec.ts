import { THEME_KEY } from '@jasonsdevspace/design-kit/theme';

import { ROUTES } from '../src/routes.js';
import { expect, fontsReady, test } from './support.js';

/*
 * The app's look in a browser: the design kit's theme, DM Sans from the app's own files, the lip
 * on the kit's keys, and nothing asked of another origin.
 */

test('no page asks another origin for anything', async ({ page, context, baseURL }) => {
    const origin = new URL(baseURL ?? 'http://localhost').origin;
    const elsewhere: string[] = [];
    // The context hears the page's requests and any a service worker makes for itself.
    context.on('request', (request) => {
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
    await page.evaluate(() => {
        const key = document.createElement('button');
        key.className = 'dk-button';
        key.id = 'key';
        key.textContent = 'Key';
        document.querySelector('main')?.append(key);
    });
    const key = page.locator('#key');
    const look = () =>
        key.evaluate((element) => {
            const style = getComputedStyle(element);
            return { shadow: style.boxShadow, translate: style.translate };
        });
    const resting = await look();
    expect(resting.shadow).toMatch(/0px 2px 0px 0px$|0px 2px 0px$/);
    expect(resting.translate).toBe('none');
    // Held down, the key drops onto where its lip was, and the lip is gone.
    const box = await key.boundingBox();
    if (!box) throw new Error('The key is not on the page.');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    expect(await look()).toEqual({ shadow: 'none', translate: '0px 2px' });
    await page.mouse.up();
});
