import { ENTRY_FILES, SCREEN_FILES } from '../src/own-files.js';
import { hrefOf } from '../src/routes.js';
import type { SavedGame, SavedPlayer } from '../src/store/format.js';
import { scriptHolding } from './built.js';
import { audit, expect, type Page, seed, test } from './support.js';

/*
 * Each screen's code loads when the screen is first opened: a game loads its own round entry and
 * fetches the scores ahead, a screen whose file is still on its way holds its place, and one whose
 * file has gone from the server offers the reload that brings the newer version.
 */

const NAMES = ['Ann', 'Ben', 'Cat'];

const player = (name: string): SavedPlayer => ({
    id: name.toLowerCase(),
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

/** A game of the kind given, at the first seat of its first round. */
const game = (kind: 'flip-7' | 'skyjo' | 'wizard'): SavedGame => ({
    id: 'g-1',
    game: kind,
    rules: 1,
    options: {},
    players: NAMES.map((name) => name.toLowerCase()),
    rounds: [],
    draft: {
        index: 0,
        round: { entries: {}, out: [] },
        step: { part: kind === 'wizard' ? 'bid' : 'entry', player: 'ann' },
    },
    started: '2026-11-14T10:00:00Z',
    changed: '2026-11-14T10:00:00Z',
});

/** The address of the built script holding a source file, which the build test holds exists. */
const scriptOf = (source: string): string => {
    const path = scriptHolding(source);
    if (!path) throw new Error(`No built script holds ${source}.`);
    return path;
};

/** Every script the page asks for from now on, by its address. */
const scriptsAskedFor = (page: Page): string[] => {
    const asked: string[] = [];
    page.on('request', (request) => {
        if (request.resourceType() === 'script') asked.push(new URL(request.url()).pathname);
    });
    return asked;
};

const tab = (page: Page, name: string) =>
    page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name, exact: true });

/** The start screen of the app, taken over, with the players saved and the games given. */
const openPlay = async (page: Page, games: readonly SavedGame[] = []) => {
    await page.goto('/');
    await seed(page, games, NAMES.map(player));
    await page.goto(hrefOf('play'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
};

for (const kind of ['flip-7', 'skyjo', 'wizard'] as const)
    test(`loads only the round entry of a game of ${kind}, and fetches the scores as it opens`, async ({
        page,
    }) => {
        await page.goto('/');
        await seed(page, [game(kind)], NAMES.map(player));
        const asked = scriptsAskedFor(page);
        await page.goto(hrefOf('game', 'g-1'));
        await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
        await expect.poll(() => asked).toContain(scriptOf(ENTRY_FILES[kind]));
        await expect.poll(() => asked).toContain(scriptOf(SCREEN_FILES.scores));
        for (const other of Object.values(ENTRY_FILES).filter((file) => file !== ENTRY_FILES[kind]))
            expect(asked).not.toContain(scriptOf(other));
    });

test('fetches the game in play and its round entry as the start screen offers it', async ({
    page,
}) => {
    await page.goto('/');
    await seed(page, [game('skyjo')], NAMES.map(player));
    const asked = scriptsAskedFor(page);
    await page.goto(hrefOf('play'));
    await expect(page.getByRole('link', { name: /^Continue the game/ })).toBeVisible();
    await expect.poll(() => asked).toContain(scriptOf(SCREEN_FILES.game));
    await expect.poll(() => asked).toContain(scriptOf(ENTRY_FILES.skyjo));
});

test('holds a screen whose code is on its way with its title and a loading line, then moves focus to it', async ({
    page,
}) => {
    await openPlay(page);
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
        release = resolve;
    });
    await page.route(`**${scriptOf(SCREEN_FILES.history)}`, async (route) => {
        await held;
        await route.continue();
    });
    await tab(page, 'History').click();
    const loading = page.locator('main [aria-busy="true"] .dk-loading');
    await expect(loading).toHaveText('Loading the screen.');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('History');
    await expect(loading).toBeVisible();
    await audit(page);
    release();
    await expect(page.locator('main [aria-busy="true"]')).toHaveCount(0);
    await expect(page.locator('#main')).toBeFocused();
});

test('offers a reload where a screen asks for a file the newer version took off the server', async ({
    page,
}) => {
    await openPlay(page);
    await page.route(`**${scriptOf(SCREEN_FILES.history)}`, (route) =>
        route.fulfill({ status: 404, body: 'Not found' })
    );
    await tab(page, 'History').click();
    await expect(page.getByText('This screen could not be shown.')).toBeVisible();
    const toast = page.locator('.dk-toast');
    await expect(toast).toContainText(
        'A newer version of the app is out. Reload this page to keep scoring.'
    );
    await expect(toast.getByRole('button', { name: 'Reload' })).toBeVisible();
});
