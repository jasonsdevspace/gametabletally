import { ROUTES } from '../src/routes.js';
import { expect, type Page, test } from './support.js';

/*
 * The service worker, in Chromium: after one visit every address opens with the connection off,
 * a navigation never reaches the network, and a newer worker installs and waits.
 */

test.use({ serviceWorkers: 'allow' });

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
    }
    const missing = await page.goto('/no-such-page/');
    expect(missing?.fromServiceWorker()).toBe(true);
    expect(missing?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Nothing at this address');
    // The app's script came from the cache too, so the page is taken over offline.
    await page.waitForFunction(() => document.documentElement.dataset['ready'] === 'true');
});

test('a navigation is answered by the worker and never reaches the network', async ({
    page,
    context,
}) => {
    await visitOnce(page);
    // The worker's own requests to the network. Once it is installed it fetches no page, so any
    // request it makes for a page is a navigation it passed to the network.
    const reached: string[] = [];
    context.on('request', (request) => {
        const { pathname } = new URL(request.url());
        if (request.serviceWorker() && (pathname.endsWith('/') || pathname.endsWith('.html')))
            reached.push(pathname);
    });
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
            await new Promise<void>((done) => {
                incoming.addEventListener('statechange', () => {
                    if (incoming.state === 'installed') done();
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
