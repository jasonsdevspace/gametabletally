import { hrefOf, NOT_FOUND_FILE, ROUTES } from '../src/routes.js';
import { audit, expect, fontsReady, smallTargets, test } from './support.js';

/*
 * Every address, as it is deployed: prerendered, read with no script, audited once it runs, and
 * the not-found page for any other path, with its 404 status.
 */

const ADDRESSES = ROUTES.map(({ path, title }) => ({ path, title }));

test.describe('with no script', () => {
    test.use({ javaScriptEnabled: false });

    for (const { path, title } of ADDRESSES)
        test(`${path} serves its page, with one top heading`, async ({ page }) => {
            const response = await page.goto(path);
            expect(response?.status()).toBe(200);
            await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
            await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
        });

    test('an address that is not one serves the not-found page, with a 404 and a way to the start', async ({
        page,
    }) => {
        const response = await page.goto('/no-such-page/');
        expect(response?.status()).toBe(404);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing at this address');
        await expect(page.getByRole('link', { name: 'Back to the start' })).toHaveAttribute(
            'href',
            '/'
        );
    });
});

for (const { path, title } of [
    ...ADDRESSES,
    { path: '/no-such-page/', title: 'Nothing at this address' },
])
    test(`${path} takes over its page with no error, and passes the axe audit and the target size check`, async ({
        page,
    }) => {
        // A page the browser draws differently from the prerender says so in the console.
        const errors: string[] = [];
        page.on('console', (message) => {
            if (message.type() === 'error') errors.push(message.text());
        });
        page.on('pageerror', (error) => errors.push(error.message));
        // A script or file the page loads that is missing would leave the prerender in place and
        // the app never running, so every failed request beside the page itself is an error.
        page.on('response', (response) => {
            if (response.status() >= 400 && response.request().resourceType() !== 'document')
                errors.push(`${response.status()} ${response.url()}`);
        });
        await page.goto(path);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
        await audit(page);
        expect(await smallTargets(page)).toEqual([]);
        // The not-found page's own 404 is the one error a browser reports, and only there.
        const own = path === '/no-such-page/' ? /status of 404/ : null;
        expect(errors.filter((text) => !own?.test(text))).toEqual([]);
    });

test('every built page asks a phone for its safe areas', async ({ request }) => {
    for (const path of [...ADDRESSES.map(({ path }) => path), `/${NOT_FOUND_FILE}`]) {
        const html = await (await request.get(path)).text();
        const viewport = /<meta name="viewport" content="([^"]*)"/.exec(html)?.[1] ?? '';
        expect(
            viewport.split(',').map((part) => part.trim()),
            path
        ).toContain('viewport-fit=cover');
    }
});

test('a page about one thing serves its page with the id in the query', async ({ page }) => {
    const response = await page.goto(hrefOf('recap', 'g-1'));
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Recap');
});

test('moves between screens with no reload, and Back returns to the screen before', async ({
    page,
}) => {
    await page.goto('/no-such-page/');
    // A mark the page keeps only while it is not loaded again.
    await page.evaluate(() => {
        Object.assign(window, { stayed: true });
    });
    await page.getByRole('link', { name: 'Back to the start' }).click();
    await expect(page).toHaveURL('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(ROUTES[0].title);
    await expect(page.locator('#main')).toBeFocused();
    expect(await page.evaluate(() => 'stayed' in window)).toBe(true);
    await page.goBack();
    await expect(page).toHaveURL('/no-such-page/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing at this address');
    expect(await page.evaluate(() => 'stayed' in window)).toBe(true);
});

for (const javaScriptEnabled of [true, false])
    test.describe(javaScriptEnabled ? 'once it runs' : 'as prerendered', () => {
        test.use({ javaScriptEnabled });

        test('every page fits the narrowest phone with no sideways scroll', async ({ page }) => {
            await page.setViewportSize({ width: 320, height: 568 });
            for (const path of [...ADDRESSES.map((address) => address.path), '/no-such-page/']) {
                await page.goto(path);
                await fontsReady(page);
                const width = await page.evaluate(() => document.documentElement.scrollWidth);
                expect(width, path).toBeLessThanOrEqual(320);
            }
        });
    });

test('a page reached by its own file keeps the screen the build drew in it', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (message) => {
        if (message.type() === 'error') errors.push(message.text());
    });
    for (const [file, title] of [
        ['/index.html', ROUTES[0].title],
        ['/about/index.html', 'About'],
    ] as const) {
        await page.goto(file);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
        // Once the app has taken over, the heading is still the one drawn into the page.
        await page.waitForFunction(() => document.documentElement.dataset['ready'] === 'true');
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
    }
    expect(errors).toEqual([]);
});

test('runs with no service worker, so no test here reads a page a worker cached', async ({
    page,
}) => {
    await page.goto('/');
    // The app asks for its worker on load. Asked again here, and waited on, the answer settles.
    const outcome = await page.evaluate(async () => {
        if (!('serviceWorker' in navigator)) return 'no workers';
        try {
            await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        } catch {
            return 'refused';
        }
        return (await navigator.serviceWorker.getRegistrations()).length > 0
            ? 'registered'
            : 'none';
    });
    expect(outcome).not.toBe('registered');
});
