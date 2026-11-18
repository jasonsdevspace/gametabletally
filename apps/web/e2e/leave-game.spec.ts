import { hrefOf } from '../src/routes.js';
import type { SavedGame, SavedPlayer } from '../src/store/format.js';
import { audit, buildGame, expect, type Page, seed, test } from './support.js';

/*
 * Leaving and discarding a game in play, as deployed: a game left from its screen is offered on the
 * start screen and continues where it was, a game discarded goes at once with a toast whose Undo
 * puts it back, and two games in play are each offered by name and whose turn it is.
 */

const NAMES = ['Ann', 'Ben', 'Cat'];

const player = (name: string): SavedPlayer => ({
    id: name.toLowerCase(),
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const hand = (numbers: number[]) => ({ numbers, modifiers: [], bust: false });

/** A game of Flip 7 in its second round, with Ann's hand entered and Ben's 7 tapped in. */
const flip7 = (): Promise<SavedGame> =>
    buildGame(
        { id: 'g-1', game: 'flip-7', rules: 1, options: {}, players: ['ann', 'ben', 'cat'] },
        async (model) => {
            for (const one of [hand([3]), hand([4]), hand([5])]) await model.enter('g-1', one);
            await model.saveRound('g-1');
            await model.enter('g-1', hand([9]));
            await model.hold('g-1', hand([7]));
        }
    );

/** A game of Skyjo just started. */
const skyjo = (): Promise<SavedGame> =>
    buildGame({
        id: 'g-2',
        game: 'skyjo',
        rules: 1,
        options: {},
        players: ['ann', 'ben', 'cat'],
    });

const seeded = async (page: Page, games: readonly SavedGame[]) => {
    await page.goto('/');
    await seed(page, games, NAMES.map(player));
};

const inPlay = (page: Page) => page.locator('.gtt-in-play');
const toast = (page: Page) => page.locator('.dk-app-toast');

test('leaves a game, continues it where it was, discards it and puts it back with Undo', async ({
    page,
}) => {
    await seeded(page, [await flip7()]);
    await page.goto(hrefOf('game', 'g-1'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.gtt-score-name')).toHaveText('Ben');
    await audit(page);

    // Leaving keeps the game as it is, and the start screen offers it.
    await page.getByRole('link', { name: 'Leave for now' }).click();
    await expect(page).toHaveURL(new RegExp(`${hrefOf('play')}$`));
    await expect(inPlay(page)).toContainText('Flip 7');
    await expect(inPlay(page)).toContainText('Round 2');
    await expect(inPlay(page)).toContainText("Ben's score is next.");
    await audit(page);

    // Continuing opens it at the round, the player and the hand it was left at.
    await page.getByRole('link', { name: 'Continue the game of Flip 7, round 2' }).click();
    await expect(page.locator('.gtt-score-name')).toHaveText('Ben');
    await expect(page.getByRole('button', { name: '7', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
    );

    // Discarding goes at once, to the start screen, with a toast whose Undo puts it back.
    await page.getByRole('button', { name: 'Discard the game' }).click();
    await expect(page).toHaveURL(new RegExp(`${hrefOf('play')}$`));
    await expect(inPlay(page)).toHaveCount(0);
    await expect(toast(page).getByRole('status')).toContainText('The game of Flip 7 is discarded.');
    await audit(page);
    await toast(page).getByRole('button', { name: 'Undo' }).click();
    await expect(inPlay(page)).toContainText("Ben's score is next.");
    await page.getByRole('link', { name: 'Continue the game of Flip 7, round 2' }).click();
    await expect(page.getByRole('button', { name: '7', exact: true })).toHaveAttribute(
        'aria-pressed',
        'true'
    );
});

test('lists two games in play by name and whose turn it is, each to continue or discard', async ({
    page,
}) => {
    await seeded(page, [await flip7(), await skyjo()]);
    await page.goto(hrefOf('play'));
    const section = page.getByRole('region', { name: 'Games in play' });
    await expect(section.getByRole('listitem')).toHaveCount(2);
    await expect(section).toContainText("Ben's score is next.");
    await expect(section).toContainText("Ann's score is next.");
    await section.getByRole('button', { name: 'Discard the game of Skyjo, round 1' }).click();
    await expect(
        page.getByRole('region', { name: 'Game in play' }).getByRole('listitem')
    ).toHaveCount(1);
    await expect(
        page.getByRole('link', { name: 'Continue the game of Flip 7, round 2' })
    ).toBeVisible();
    await audit(page);
});
