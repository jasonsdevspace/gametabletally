import { hrefOf } from '../src/routes.js';
import type { SavedPlayer } from '../src/store/format.js';
import { buildGame, expect, type Page, seed, test } from './support.js';

/*
 * A new version as the deployed app meets one, in Chromium: a newer worker installs and waits, the
 * round's screen never offers it, the scores page does, and agreeing hands the page to it with one
 * reload and the game as it was.
 */

test.use({ serviceWorkers: 'allow' });

const NAMES = ['Ann', 'Ben', 'Cat'];

const player = (name: string): SavedPlayer => ({
    id: name.toLowerCase(),
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const hand = (numbers: number[]) => ({ numbers, modifiers: [], bust: false });

/** A game of Flip 7 with one round saved. */
const inSecondRound = () =>
    buildGame(
        { id: 'g-1', game: 'flip-7', rules: 1, options: {}, players: ['ann', 'ben', 'cat'] },
        async (model) => {
            for (const one of [hand([3, 7]), hand([12]), hand([10])]) await model.enter('g-1', one);
            await model.saveRound('g-1');
        }
    );

/**
 * Installs a newer worker beside the one in charge, as a new build's is, and waits until it is
 * waiting. A worker at another address within the same scope is a newer worker.
 */
const installNewer = (page: Page): Promise<void> =>
    page.evaluate(async () => {
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

/** The worker in charge of the page, by its address. */
const inCharge = (page: Page): Promise<string | null> =>
    page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? null);

test("offers a waiting version off the round's screen, and takes it once agreed, with the game as it was", async ({
    page,
}) => {
    await page.goto('/');
    await seed(page, [await inSecondRound()], NAMES.map(player));
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    // Opened again, so the first worker is in charge of the round's screen and the app watches it.
    await page.goto(hrefOf('game', 'g-1'));
    await page.waitForLoadState('load');
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    expect(await inCharge(page)).toMatch(/\/sw\.js$/);
    await installNewer(page);

    const toast = page.locator('.dk-app-toast');
    const update = toast.getByRole('button', { name: 'Update' });
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Game in play');
    await expect(update).toBeHidden();

    await page
        .getByRole('region', { name: 'Actions' })
        .getByRole('link', { name: 'Scores' })
        .click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Scores');
    await expect(toast.getByText('A new version of the app is ready.')).toBeVisible();
    const standings = page.getByRole('list', { name: 'Standings' }).getByRole('listitem');
    await expect(standings).toHaveCount(3);
    const before = await standings.allTextContents();

    let loads = 0;
    page.on('load', () => {
        loads += 1;
    });
    await page.evaluate(() => {
        Object.assign(window, { stayed: true });
    });
    await expect(update).toBeEnabled();
    const reloaded = page.waitForEvent('load');
    await update.click();
    await reloaded;
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    expect(await inCharge(page)).toMatch(/\/sw\.js\?build=2$/);
    expect(await page.evaluate(() => 'stayed' in window)).toBe(false);
    await expect(page).toHaveURL(new RegExp(`\\${hrefOf('scores', 'g-1').replace('?', '\\?')}$`));
    await expect(standings).toHaveText(before);
    expect(loads).toBe(1);
});
