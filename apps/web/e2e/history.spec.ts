import { hrefOf } from '../src/routes.js';
import type { SavedGame, SavedPlayer } from '../src/store/format.js';
import { audit, buildGame, expect, type Page, seed, test } from './support.js';

/*
 * The history, as deployed: two finished games listed newest first, one opened to its recap, the
 * other deleted from its recap and put back from the toast, and an empty history that says how to
 * start a game, with the audit on each.
 */

const NAMES = ['Ann', 'Ben', 'Cat'];

const player = (name: string): SavedPlayer => ({
    id: name.toLowerCase(),
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const hand = (numbers: number[], modifiers: string[] = []) => ({ numbers, modifiers, bust: false });
const SEVEN = [12, 11, 10, 9, 8, 7, 6];

/**
 * A game of Flip 7 the player in the seat given wins in two rounds, started on the day given, so
 * two games seeded the same way have dates of their own.
 */
const won = async (id: string, winner: number, day: string): Promise<SavedGame> => {
    const game = await buildGame(
        { id, game: 'flip-7', rules: 1, options: {}, players: ['ann', 'ben', 'cat'] },
        async (model) => {
            for (const strong of [hand(SEVEN, ['x2', '+10']), hand(SEVEN)]) {
                for (const seat of [0, 1, 2])
                    await model.enter(id, seat === winner ? strong : hand([seat + 1]));
                await model.saveRound(id);
            }
        }
    );
    return { ...game, started: `${day}T19:00:00Z` };
};

/** A game of Flip 7 still in play, started after both finished ones. */
const inPlay = (): Promise<SavedGame> =>
    buildGame({ id: 'g-3', game: 'flip-7', rules: 1, options: {}, players: ['ann', 'ben'] });

const rows = (page: Page) => page.getByRole('list', { name: 'Finished games' }).getByRole('link');
const toast = (page: Page) => page.locator('.dk-app-toast');

test('lists two finished games, opens one, and deletes the other and puts it back', async ({
    page,
}) => {
    await page.goto('/');
    await seed(
        page,
        [await won('g-1', 0, '2026-11-14'), await won('g-2', 1, '2026-11-21'), await inPlay()],
        NAMES.map(player)
    );
    await page.goto(hrefOf('history'));
    await expect(rows(page)).toHaveText([
        /^Ben won, Flip 7, November 21, 2026\. Ann, Ben and Cat\./,
        /^Ann won, Flip 7, November 14, 2026\. Ann, Ben and Cat\./,
    ]);
    await audit(page);

    // A row opens its game's recap.
    await rows(page).nth(1).click();
    await expect(page).toHaveURL(hrefOf('recap', 'g-1'));
    await expect(page.getByText('Ann wins with 229.')).toBeVisible();
    await page.goBack();
    await expect(rows(page)).toHaveCount(2);

    // Deleting the other from its recap takes it out of the list at once, and Undo puts it back.
    await rows(page).first().click();
    await expect(page.getByText('Ben wins with 229.')).toBeVisible();
    await page.getByRole('button', { name: 'Delete this game' }).click();
    await expect(page).toHaveURL(hrefOf('history'));
    await expect(rows(page)).toHaveText([/^Ann won, Flip 7, November 14, 2026\./]);
    await expect(toast(page).getByRole('status')).toContainText('The game of Flip 7 is deleted.');
    await audit(page);
    await toast(page).getByRole('button', { name: 'Undo' }).click();
    await expect(rows(page)).toHaveText([
        /^Ben won, Flip 7, November 21, 2026\. Ann, Ben and Cat\./,
        /^Ann won, Flip 7, November 14, 2026\. Ann, Ben and Cat\./,
    ]);
    await rows(page).first().click();
    await expect(page.getByText('Ben wins with 229.')).toBeVisible();
});

test('says what will appear there and how to start a game while no game has finished', async ({
    page,
}) => {
    await page.goto('/');
    await seed(page, [await inPlay()], NAMES.map(player));
    await page.goto(hrefOf('history'));
    await expect(page.getByText('No finished games yet.', { exact: false })).toBeVisible();
    await audit(page);
    await page.getByRole('link', { name: 'Start a game' }).click();
    await expect(page).toHaveURL(hrefOf('play'));
});
