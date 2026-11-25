import { fileURLToPath } from 'node:url';

import { precacheOf } from '../scripts/precache.mjs';
import { SCREEN_FILES } from '../src/own-files.js';
import { ROUTES } from '../src/routes.js';
import { scriptHolding } from './built.js';
import { expect, type Page, test } from './support.js';

/*
 * The service worker, in Chromium: after one visit every address opens with the connection off,
 * a navigation never reaches the network, and a newer worker installs and waits.
 */

test.use({ serviceWorkers: 'allow' });

/** The cache the build's worker keeps the app in, named for what the build holds. */
const CACHE = `game-table-tally-${precacheOf(fileURLToPath(new URL('../dist', import.meta.url))).version}`;

/**
 * The paths the worker itself asks the network for, from now on. Once it is installed it holds
 * every file of the app, so any request it makes is one it passed to the network.
 */
const requestsOfTheWorker = (page: Page): string[] => {
    const reached: string[] = [];
    page.context().on('request', (request) => {
        if (request.serviceWorker()) reached.push(new URL(request.url()).pathname);
    });
    return reached;
};

/** Visits the start and waits for its worker to be active, as one visit leaves the phone. */
const visitOnce = async (page: Page): Promise<void> => {
    await page.goto('/');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
};

test('after one visit, every address opens with the connection off', async ({ page, context }) => {
    await visitOnce(page);
    await context.setOffline(true);
    for (const { path, title } of ROUTES) {
        const response = await page.goto(path);
        expect(response?.fromServiceWorker(), path).toBe(true);
        expect(response?.status(), path).toBe(200);
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
        // The screen's own code came from the cache too, so the app took the page over whole.
        await expect(page.locator('html'), path).toHaveAttribute('data-ready', 'true');
        await expect(page.getByText(/could not be shown/), path).toHaveCount(0);
    }
    const missing = await page.goto('/no-such-page/');
    expect(missing?.fromServiceWorker()).toBe(true);
    expect(missing?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing at this address');
    // The app's script came from the cache too, so the page is taken over offline.
    await page.waitForFunction(() => document.documentElement.dataset['ready'] === 'true');
});

test("after one visit, a move to a screen not yet opened draws it from the worker's cache", async ({
    page,
    context,
}) => {
    await visitOnce(page);
    await context.setOffline(true);
    await page.goto('/play/');
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    const tabs = page.getByRole('navigation', { name: 'Sections' });
    for (const name of ['History', 'Players']) {
        await tabs.getByRole('link', { name, exact: true }).click();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
        await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
        await expect(page.getByText(/could not be shown/)).toHaveCount(0);
    }
});

test('once the worker serves the page, a move to a screen not yet opened draws with no loading line', async ({
    page,
}) => {
    const asked: string[] = [];
    page.on('request', (request) => {
        if (request.resourceType() === 'script') asked.push(new URL(request.url()).pathname);
    });
    await page.goto('/play/');
    // Each screen's code is loaded once the worker has taken the page.
    for (const source of [SCREEN_FILES.history, SCREEN_FILES.players])
        await expect.poll(() => asked).toContain(scriptHolding(source));
    await page.evaluate(() => {
        new MutationObserver(() => {
            if (document.querySelector('.dk-loading'))
                document.documentElement.dataset['sawLoading'] = 'true';
        }).observe(document.body, { childList: true, subtree: true });
    });
    const tabs = page.getByRole('navigation', { name: 'Sections' });
    for (const name of ['History', 'Players']) {
        await tabs.getByRole('link', { name, exact: true }).click();
        await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    }
    await expect(page.locator('html')).not.toHaveAttribute('data-saw-loading');
});

test('a navigation is answered by the worker and never reaches the network', async ({ page }) => {
    await visitOnce(page);
    const reached = requestsOfTheWorker(page);
    for (const path of ['/about/', '/no-such-page/', '/about']) {
        const response = await page.goto(path);
        expect(response?.fromServiceWorker(), path).toBe(true);
    }
    // A folder asked for without its slash is sent to the path with it, as Pages sends it.
    await expect(page).toHaveURL('/about/');
    expect(reached).toEqual([]);
});

test('a newer worker installs and waits, and the page keeps the first with no reload', async ({
    page,
}) => {
    await visitOnce(page);
    await page.reload();
    await page.evaluate(() => {
        Object.assign(window, { stayed: true });
    });
    const states = await page.evaluate(async () => {
        const first = navigator.serviceWorker.controller?.scriptURL ?? null;
        // A worker at another address within the same scope is a newer worker, as a new build's is.
        const registration = await navigator.serviceWorker.register('/sw.js?build=2', {
            scope: '/',
        });
        const incoming = registration.installing ?? registration.waiting;
        if (incoming && incoming.state !== 'installed')
            await new Promise<void>((done, fail) => {
                incoming.addEventListener('statechange', () => {
                    if (incoming.state === 'installed') done();
                    // An install that fails ends the wait at once, rather than at the timeout.
                    if (incoming.state === 'redundant')
                        fail(new Error('The newer worker did not install.'));
                });
            });
        return {
            first,
            waiting: registration.waiting?.scriptURL ?? null,
            active: registration.active?.scriptURL ?? null,
            controller: navigator.serviceWorker.controller?.scriptURL ?? null,
        };
    });
    expect(states.first).toMatch(/\/sw\.js$/);
    expect(states.waiting).toMatch(/\/sw\.js\?build=2$/);
    expect(states.active).toBe(states.first);
    expect(states.controller).toBe(states.first);
    expect(await page.evaluate(() => 'stayed' in window)).toBe(true);
    // A waiting worker stays waiting through a reload of the one page it would serve, so the
    // first still answers. One that took over by itself would answer the reloaded page.
    await page.reload();
    const after = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.getRegistration();
        return {
            controller: navigator.serviceWorker.controller?.scriptURL ?? null,
            waiting: registration?.waiting?.scriptURL ?? null,
        };
    });
    expect(after).toEqual({ controller: states.first, waiting: states.waiting });
});

test('keeps the app in one cache, named for the build it came from', async ({ page }) => {
    await visitOnce(page);
    expect(await page.evaluate(() => caches.keys())).toEqual([CACHE]);
});

test('a newer worker deletes the cache an older build left once it takes over', async ({
    page,
    context,
}) => {
    await visitOnce(page);
    await page.evaluate(async () => {
        const older = await caches.open('game-table-tally-older');
        await older.put('/index.html', new Response('an older build'));
        const registration = await navigator.serviceWorker.register('/sw.js?build=2', {
            scope: '/',
        });
        const incoming = registration.installing ?? registration.waiting;
        if (incoming && incoming.state !== 'installed')
            await new Promise<void>((done, fail) => {
                incoming.addEventListener('statechange', () => {
                    if (incoming.state === 'installed') done();
                    if (incoming.state === 'redundant')
                        fail(new Error('The newer worker did not install.'));
                });
            });
    });
    // With its only page closed the first worker serves no one, so the newer one takes over.
    await page.close();
    const next = await context.newPage();
    await next.goto('/');
    await expect
        .poll(() =>
            next.evaluate(async () => {
                const active = (await navigator.serviceWorker.getRegistration())?.active;
                return active?.state === 'activated' ? active.scriptURL : null;
            })
        )
        .toMatch(/\/sw\.js\?build=2$/);
    expect(await next.evaluate(() => caches.keys())).toEqual([CACHE]);
});

test('sends a folder asked for without its slash to the path with it, keeping the query', async ({
    page,
    context,
}) => {
    await visitOnce(page);
    await context.setOffline(true);
    await page.goto('/about?from=start');
    await expect(page).toHaveURL('/about/?from=start');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('About');
});

test('refuses a page its cache has lost rather than fetching it', async ({ page }) => {
    await visitOnce(page);
    await page.evaluate(async (name) => {
        await (await caches.open(name)).delete('/about/index.html');
    }, CACHE);
    const reached = requestsOfTheWorker(page);
    const response = await page.goto('/about/');
    expect(response?.fromServiceWorker()).toBe(true);
    expect(response?.status()).toBe(504);
    expect(reached).toEqual([]);
});
