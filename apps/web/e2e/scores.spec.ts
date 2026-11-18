import { THEME_KEY } from '@jasonsdevspace/design-kit/theme';

import { hrefOf } from '../src/routes.js';
import type { SavedGame, SavedPlayer } from '../src/store/format.js';
import { audit, buildGame, expect, type Page, seed, test } from './support.js';

/*
 * The scores of a game in play, as deployed: opened from the dock of the round's screen, the
 * standings and every round of a game in its third round, audited in both themes, the names and
 * totals pinned while the rounds scroll on the narrowest phone with nothing showing through them,
 * and the table's frame reached and scrolled by the keyboard.
 */

const NAMES = ['Ann', 'Ben', 'Cat'];

const player = (name: string): SavedPlayer => ({
    id: name.toLowerCase(),
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const hand = (numbers: number[]) => ({ numbers, modifiers: [], bust: false });

/** A game of Flip 7 with two rounds saved and Ann's hand of the third entered. */
const inThirdRound = (): Promise<SavedGame> =>
    buildGame(
        { id: 'g-1', game: 'flip-7', rules: 1, options: {}, players: ['ann', 'ben', 'cat'] },
        async (model) => {
            for (const round of [
                [hand([3, 7]), hand([12]), hand([10])],
                [hand([2]), hand([1]), hand([5, 6])],
            ]) {
                for (const one of round) await model.enter('g-1', one);
                await model.saveRound('g-1');
            }
            await model.enter('g-1', hand([9]));
        }
    );

/**
 * A game of Flip 7 with eight small rounds saved, more than the narrowest phone shows beside the
 * names, so its rounds scroll.
 */
const inNinthRound = (): Promise<SavedGame> =>
    buildGame(
        { id: 'g-1', game: 'flip-7', rules: 1, options: {}, players: ['ann', 'ben', 'cat'] },
        async (model) => {
            for (let round = 0; round < 8; round += 1) {
                for (const one of [hand([1]), hand([2]), hand([3])]) await model.enter('g-1', one);
                await model.saveRound('g-1');
            }
        }
    );

/** The scores page of the game given, read once the screen is running. */
const openScores = async (
    page: Page,
    theme?: 'light' | 'dark',
    game: () => Promise<SavedGame> = inThirdRound
) => {
    await page.goto('/');
    if (theme !== undefined)
        await page.evaluate(
            ([key, value]) => {
                localStorage.setItem(key, value);
            },
            [THEME_KEY, theme] as const
        );
    await seed(page, [await game()], NAMES.map(player));
    await page.goto(hrefOf('scores', 'g-1'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByRole('list', { name: 'Standings' })).toBeVisible();
};

const frame = (page: Page) => page.getByRole('region', { name: 'Scores by round, newest first' });
const table = (page: Page) => page.getByRole('table', { name: 'Scores by round, newest first' });

test('opens the scores from the dock of the round, and goes back to the round from its own', async ({
    page,
}) => {
    await page.goto('/');
    await seed(page, [await inThirdRound()], NAMES.map(player));
    await page.goto(hrefOf('game', 'g-1'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    const dock = page.getByRole('region', { name: 'Actions' });
    await dock.getByRole('link', { name: 'Scores' }).click();
    await expect(page).toHaveURL(new RegExp(`\\${hrefOf('scores', 'g-1').replace('?', '\\?')}$`));
    await expect(page.getByText('Cat leads with 21.')).toBeVisible();
    await dock.getByRole('link', { name: 'Back to round 3' }).click();
    await expect(page.locator('.gtt-score-name')).toHaveText('Ben');
});

for (const theme of ['light', 'dark'] as const)
    test(`shows the standings and every round of a game in its third round, in the ${theme} theme`, async ({
        page,
    }) => {
        await openScores(page, theme);
        await expect(page.getByText('Cat leads with 21.')).toBeVisible();
        await expect(
            page.getByRole('list', { name: 'Standings' }).getByRole('listitem')
        ).toHaveText([
            'Cat, 1st place, 21 points',
            'Ben, 2nd place, 13 points',
            'Ann, 3rd place, 12 points',
        ]);
        await expect(table(page).getByRole('columnheader')).toHaveText([
            'Player and total',
            'Round 3 not yet counted',
            'Round 2',
            'Round 1',
        ]);
        await expect(table(page).getByRole('rowheader')).toHaveText([
            'Ann, 12 in all',
            'Ben, 13 in all',
            'Cat, 21 in all',
        ]);
        await audit(page);
    });

test('keeps the names and totals in view while the rounds scroll on the narrowest phone, with nothing showing through', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 640 });
    for (const theme of ['light', 'dark'] as const) {
        await openScores(page, theme, inNinthRound);
        const scroll = frame(page);
        // The table sits below the standings, so the page is scrolled to it first.
        await scroll.scrollIntoViewIfNeeded();
        await scroll.evaluate((element) => {
            element.scrollLeft = element.scrollWidth;
        });
        await expect
            .poll(() => scroll.evaluate((element) => element.scrollLeft))
            .toBeGreaterThan(0);
        // Each pinned cell is still where it was, and is what a tap at its middle and at its end
        // reaches, so no cell scrolled under it shows through.
        for (const head of await table(page).getByRole('rowheader').all()) {
            const reached = await head.evaluate((cell) => {
                const { x, y, width, height } = cell.getBoundingClientRect();
                return [x + width / 2, x + width - 2].every((at) => {
                    const top = document.elementFromPoint(at, y + height / 2);
                    return top !== null && (top === cell || cell.contains(top));
                });
            });
            expect(reached, `${theme} theme`).toBe(true);
            const ground = await head.evaluate((cell) => getComputedStyle(cell).backgroundColor);
            expect(ground, `${theme} theme`).not.toMatch(/rgba\(.*, 0\)$|transparent/);
        }
    }
});

test("reaches the table's frame by the keyboard and scrolls it with the arrow keys", async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openScores(page, undefined, inNinthRound);
    await frame(page).focus();
    await expect(frame(page)).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect
        .poll(() => frame(page).evaluate((element) => element.scrollLeft))
        .toBeGreaterThan(0);
    expect(await frame(page).getAttribute('tabindex')).toBe('0');
});
