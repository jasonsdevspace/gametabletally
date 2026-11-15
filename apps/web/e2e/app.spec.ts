import { THEME_KEY } from '@jasonsdevspace/design-kit/theme';

import { hrefOf } from '../src/routes.js';
import type { SavedPlayer } from '../src/store/format.js';
import { audit, buildGame, expect, type Page, seed, smallTargets, test } from './support.js';

/*
 * The app's frame and its start screen, as deployed: the game in play offered to continue, the tab
 * bar and its marked tab, the one place a toast is shown, and the screen by keyboard alone, audited
 * on a desktop and a phone profile in each theme.
 */

const player = (id: string, name: string): SavedPlayer => ({
    id,
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

/** The start screen with a game of Wizard in play, Ben's bid next. */
const withGameInPlay = async (page: Page) => {
    const game = await buildGame(
        { id: 'g-wizard', game: 'wizard', rules: 1, options: {}, players: ['ann', 'ben', 'cat'] },
        async (model) => {
            await model.enter('g-wizard', 1);
        }
    );
    await page.goto('/');
    await seed(page, [game], [player('ann', 'Ann'), player('ben', 'Ben'), player('cat', 'Cat')]);
    await page.goto(hrefOf('play'));
};

const tabs = (page: Page) => page.getByRole('navigation', { name: 'Sections' });

test('offers to continue the game in play, naming the game and whose turn it is', async ({
    page,
}) => {
    await withGameInPlay(page);
    const card = page
        .locator('div', {
            has: page.getByRole('heading', { name: 'Game in play' }),
        })
        .last();
    await expect(card.getByText('Wizard', { exact: true })).toBeVisible();
    await expect(card.getByText('Round 1')).toBeVisible();
    await expect(card.getByText("Ben's bid is next.")).toBeVisible();
    await card.getByRole('link', { name: 'Continue the game' }).click();
    await expect(page).toHaveURL(/\/game\/\?id=g-wizard$/);
});

test('offers only to start a game when none is in play, and says whose games these are not', async ({
    page,
}) => {
    await page.goto(hrefOf('play'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(
        page.getByRole('list', { name: 'Start a new game' }).getByRole('link')
    ).toHaveCount(3);
    await expect(page.getByRole('heading', { name: 'Game in play' })).toHaveCount(0);
    await expect(page.getByRole('main')).toContainText('not affiliated with the publishers');
});

test('marks the tab the visitor is in, by more than its color, and the one a screen sits beneath', async ({
    page,
}) => {
    await page.goto(hrefOf('play'));
    const style = (name: string) =>
        tabs(page)
            .getByRole('link', { name, exact: true })
            .evaluate((link) => ({
                current: link.getAttribute('aria-current'),
                weight: Number(getComputedStyle(link).fontWeight),
            }));
    const [current, other] = await Promise.all([style('Play'), style('History')]);
    expect(current.current).toBe('page');
    expect(other.current).toBeNull();
    expect(current.weight).toBeGreaterThan(other.weight);
    await page.goto(hrefOf('new'));
    await expect(tabs(page).getByRole('link', { name: 'Play', exact: true })).toHaveAttribute(
        'aria-current',
        'true'
    );
    await tabs(page).getByRole('link', { name: 'Players' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Players');
    await expect(tabs(page).getByRole('link', { name: 'Players' })).toHaveAttribute(
        'aria-current',
        'page'
    );
});

test('keeps the tab bar at the bottom edge and one empty toast place on every screen', async ({
    page,
}) => {
    for (const name of ['play', 'new', 'history', 'players'] as const) {
        await page.goto(hrefOf(name));
        const bar = await tabs(page).boundingBox();
        const height = page.viewportSize()?.height ?? 0;
        expect(Math.round((bar?.y ?? 0) + (bar?.height ?? 0)), name).toBe(height);
        const toast = page.locator('.dk-app-toast').getByRole('status');
        await expect(toast, name).toHaveCount(1);
        await expect(toast, name).toHaveText('');
    }
});

test('names the main region by the screen, so focus arriving there says where the visitor is', async ({
    page,
}) => {
    await page.goto(hrefOf('play'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await tabs(page).getByRole('link', { name: 'History' }).click();
    await expect(page.getByRole('main', { name: 'History' })).toBeFocused();
});

test('works by keyboard alone, from the game in play to the tabs', async ({ page }) => {
    await withGameInPlay(page);
    await expect(page.getByRole('link', { name: 'Continue the game' })).toBeVisible();
    const reached: string[] = [];
    for (let at = 0; at < 12; at += 1) {
        await page.keyboard.press('Tab');
        reached.push(await page.evaluate(() => document.activeElement?.textContent.trim() ?? ''));
    }
    for (const name of ['About', 'Continue the game', 'Flip 7', 'Skyjo', 'Wizard', 'Players'])
        expect(
            reached.some((text) => text.startsWith(name)),
            name
        ).toBe(true);
    await page.getByRole('link', { name: 'Continue the game' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/game\/\?id=g-wizard$/);
});

for (const theme of ['light', 'dark'] as const)
    test(`passes the axe audit and the target size check in the ${theme} theme, following the kit's switch`, async ({
        page,
    }) => {
        await page.addInitScript(
            ([key, value]) => {
                localStorage.setItem(key, value);
            },
            [THEME_KEY, theme] as const
        );
        await withGameInPlay(page);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(page.getByRole('link', { name: 'Continue the game' })).toBeVisible();
        await audit(page);
        expect(await smallTargets(page)).toEqual([]);
    });
