import { THEME_KEY } from '@jasonsdevspace/design-kit/theme';

import { hrefOf } from '../src/routes.js';
import { audit, expect, fontsReady, test } from './support.js';

/*
 * The website's pages, the first visit, the install page and the about page, with the not-found
 * page beside them: read with no script, laid out at the narrowest phone and a laptop, the header's
 * links in view and the current one marked, and the browser's offer to install where it makes one.
 */

const PAGES = ['/', '/install/', '/about/', '/no-such-page/'] as const;
const LINKS = ['Install', 'About', 'Open the app'] as const;

test.describe('with no script', () => {
    test.use({ javaScriptEnabled: false });

    for (const path of ['/', '/install/', '/about/'] as const)
        test(`${path} shows its heading, its text and its links`, async ({ page }) => {
            await page.goto(path);
            await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
            await expect(page.locator('main p').first()).toBeVisible();
            const nav = page.getByRole('banner').getByRole('navigation', { name: 'Website' });
            for (const name of LINKS) await expect(nav.getByRole('link', { name })).toBeVisible();
            await expect(page.getByRole('contentinfo')).toContainText('not affiliated');
        });

    test('the install page gives both sets of steps, and no button that would do nothing', async ({
        page,
    }) => {
        await page.goto(hrefOf('install'));
        for (const name of ['On an iPhone or iPad', 'On an Android phone'])
            await expect(page.getByRole('region', { name }).getByRole('listitem')).toHaveCount(4);
        await expect(page.getByRole('button', { name: 'Install the app' })).toHaveCount(0);
    });
});

for (const width of [320, 1280])
    test(`at ${width} wide no page scrolls sideways, no text is cut off, and every header link is in view`, async ({
        page,
    }) => {
        await page.setViewportSize({ width, height: 800 });
        for (const path of PAGES) {
            await page.goto(path);
            await fontsReady(page);
            const { scroll, outside, clipped } = await page.evaluate(() => {
                const all = [...document.body.querySelectorAll<HTMLElement>('*')].filter(
                    (element) => element.getClientRects().length > 0
                );
                const named = (element: Element) =>
                    `${element.tagName.toLowerCase()}.${element.className}: ${element.textContent.trim().slice(0, 30)}`;
                return {
                    scroll: document.documentElement.scrollWidth,
                    // A box past the right edge, other than one drawn out of sight on purpose.
                    outside: all
                        .filter((element) => {
                            const box = element.getBoundingClientRect();
                            return box.width > 1 && box.right > window.innerWidth + 0.5;
                        })
                        .map(named),
                    // Text wider than a box that hides what overflows it.
                    clipped: all
                        .filter((element) => {
                            const { overflowX } = getComputedStyle(element);
                            // A box a pixel wide is out of sight on purpose, such as the skip link.
                            return (
                                (overflowX === 'hidden' || overflowX === 'clip') &&
                                element.clientWidth > 1 &&
                                element.scrollWidth > element.clientWidth + 1
                            );
                        })
                        .map(named),
                };
            });
            expect(scroll, path).toBeLessThanOrEqual(width);
            expect(outside, path).toEqual([]);
            expect(clipped, path).toEqual([]);
            const nav = page.getByRole('banner').getByRole('navigation', { name: 'Website' });
            for (const name of LINKS)
                await expect(nav.getByRole('link', { name }), `${path} ${name}`).toBeInViewport({
                    ratio: 1,
                });
        }
    });

test('marks the current page in the header by more than its color', async ({ page }) => {
    await page.goto(hrefOf('about'));
    const style = (name: string) =>
        page
            .getByRole('banner')
            .getByRole('link', { name, exact: true })
            .evaluate((link) => {
                const drawn = getComputedStyle(link);
                return {
                    current: link.getAttribute('aria-current'),
                    weight: Number(drawn.fontWeight),
                    ground: drawn.backgroundColor,
                };
            });
    const [current, other] = await Promise.all([style('About'), style('Install')]);
    expect(current.current).toBe('page');
    expect(other.current).toBeNull();
    expect(current.weight).toBeGreaterThan(other.weight);
    expect(current.ground).not.toBe(other.ground);
});

test("keeps the install page's status line on the page while it is empty, so it is heard when it speaks", async ({
    page,
}) => {
    await page.goto(hrefOf('install'));
    await expect(page.getByRole('status')).toBeAttached();
    await expect(page.getByRole('status')).toHaveText('');
});

test("offers the browser's own prompt, and shows it when pressed", async ({ page }) => {
    await page.goto(hrefOf('install'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await page.evaluate(() => {
        const event = new Event('beforeinstallprompt', { cancelable: true });
        Object.assign(window, { prompted: 0 });
        Object.assign(event, {
            prompt: () => {
                Object.assign(window, { prompted: 1 });
                return Promise.resolve();
            },
            userChoice: Promise.resolve({ outcome: 'accepted' }),
        });
        window.dispatchEvent(event);
    });
    await page.getByRole('button', { name: 'Install the app' }).click();
    expect(await page.evaluate(() => 'prompted' in window && window.prompted === 1)).toBe(true);
    await expect(page.getByRole('status')).toHaveText(
        'The app is installed. Open it from your home screen.'
    );
    await expect(page.getByRole('button', { name: 'Install the app' })).toHaveCount(0);
    // The button is gone, so focus is on the way on rather than back at the page's start.
    await expect(page.getByRole('main').getByRole('link', { name: 'Open the app' })).toBeFocused();
});

test('switches between light and dark from the about page', async ({ page }) => {
    await page.goto(hrefOf('about'));
    await page.getByRole('radio', { name: 'Dark' }).check();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

for (const theme of ['light', 'dark'] as const)
    test(`passes the axe audit in the ${theme} theme, the game tiles' text among it`, async ({
        page,
    }) => {
        await page.addInitScript(
            ([key, value]) => {
                localStorage.setItem(key, value);
            },
            [THEME_KEY, theme] as const
        );
        for (const path of PAGES) {
            await page.goto(path);
            await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
            await audit(page);
        }
    });
