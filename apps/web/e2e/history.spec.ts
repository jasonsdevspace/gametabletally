import { hrefOf } from '../src/routes.js';
import type { SavedGame, SavedPlayer } from '../src/store/format.js';
import { audit, buildGame, expect, type Page, seed, test } from './support.js';

/*
 * The history, as deployed: two finished games listed newest first, one opened to its recap, the
 * other deleted from its recap and put back from the toast, Back after a delete never reaching the
 * game deleted or the history twice, and an empty history that says how to start a game, with the
 * audit on each.
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
 * A game of Flip 7 the player in the seat given wins in two rounds, started on the day given and
 * last changed later that evening, so two games seeded the same way have dates of their own.
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
    return { ...game, started: `${day}T19:00:00Z`, changed: `${day}T19:30:00Z` };
};

/**
 * A game of Flip 7 in its second round, Ann's turn, where seven numbers take her past two hundred,
 * started after the finished games.
 */
const oneRoundLeft = async (): Promise<SavedGame> => {
    const game = await buildGame(
        { id: 'g-3', game: 'flip-7', rules: 1, options: {}, players: ['ann', 'ben', 'cat'] },
        async (model) => {
            for (const one of [hand(SEVEN, ['x2', '+10']), hand([3]), hand([1])])
                await model.enter('g-3', one);
            await model.saveRound('g-3');
        }
    );
    return { ...game, started: '2026-11-23T19:00:00Z', changed: '2026-11-23T19:10:00Z' };
};

const rows = (page: Page) => page.getByRole('list', { name: 'Finished games' }).getByRole('link');
const toast = (page: Page) => page.locator('.dk-app-toast');
const tab = (page: Page, name: string) =>
    page.getByRole('navigation', { name: 'Sections' }).getByRole('link', { name, exact: true });
const pathOf = (page: Page) => new URL(page.url()).pathname;

const seeded = async (page: Page, games: readonly SavedGame[]) => {
    await page.goto('/');
    await seed(page, games, NAMES.map(player));
};

test('lists two finished games, opens one, and deletes the other and puts it back', async ({
    page,
}) => {
    await seeded(page, [
        await won('g-1', 0, '2026-11-14'),
        await won('g-2', 1, '2026-11-21'),
        await oneRoundLeft(),
    ]);
    await page.goto(hrefOf('history'));
    await expect(rows(page)).toHaveText([
        /^Ben won with 229, Flip 7, November 21, 2026\. Ann, Ben and Cat\./,
        /^Ann won with 229, Flip 7, November 14, 2026\. Ann, Ben and Cat\./,
    ]);
    await audit(page);

    // A row opens its game's recap, under the History tab.
    await rows(page).nth(1).click();
    await expect(page).toHaveURL(`${hrefOf('recap', 'g-1')}&from=history`);
    await expect(page.getByText('Ann wins with 229.')).toBeVisible();
    await expect(tab(page, 'History')).toHaveAttribute('aria-current', 'true');
    await expect(tab(page, 'Play')).not.toHaveAttribute('aria-current');
    await page.goBack();
    await expect(rows(page)).toHaveCount(2);

    // Deleting the other from its recap takes it out of the list at once, and Undo puts it back.
    await rows(page).first().click();
    await expect(page.getByText('Ben wins with 229.')).toBeVisible();
    await page.getByRole('button', { name: 'Delete this game' }).click();
    await expect(page).toHaveURL(hrefOf('history'));
    await expect(rows(page)).toHaveText([/^Ann won with 229, Flip 7, November 14, 2026\./]);
    await expect(toast(page).getByRole('status')).toContainText(
        'The game of Flip 7 from November 21, 2026 is deleted.'
    );
    await audit(page);
    await toast(page).getByRole('button', { name: 'Undo' }).click();
    await expect(rows(page)).toHaveText([
        /^Ben won with 229, Flip 7, November 21, 2026\. Ann, Ben and Cat\./,
        /^Ann won with 229, Flip 7, November 14, 2026\. Ann, Ben and Cat\./,
    ]);
    await rows(page).first().click();
    await expect(page.getByText('Ben wins with 229.')).toBeVisible();
});

test('goes back past the history after a game deleted from it, never to the history twice', async ({
    page,
}) => {
    await seeded(page, [await won('g-1', 0, '2026-11-14')]);
    await page.goto(hrefOf('history'));
    await rows(page).first().click();
    await page.getByRole('button', { name: 'Delete this game' }).click();
    await expect(page).toHaveURL(hrefOf('history'));
    await expect(toast(page).getByRole('button', { name: 'Undo' })).toBeVisible();
    await page.goBack();
    await expect.poll(() => pathOf(page)).toBe('/');
});

test('goes back to the start screen, not the game deleted, after a game that just ended', async ({
    page,
}) => {
    await seeded(page, [await oneRoundLeft()]);
    await page.goto(hrefOf('play'));
    await page.getByRole('link', { name: 'Continue the game of Flip 7, round 2' }).click();
    const dock = page.getByRole('region', { name: 'Actions' });
    for (const card of SEVEN)
        await page.getByRole('button', { name: String(card), exact: true }).click();
    await dock.getByRole('button', { name: 'Next: Ben' }).click();
    await page.getByRole('button', { name: '4', exact: true }).click();
    await dock.getByRole('button', { name: 'Next: Cat' }).click();
    await page.getByRole('button', { name: '1', exact: true }).click();
    await dock.getByRole('button', { name: 'Save the round' }).click();
    await expect(page).toHaveURL(hrefOf('recap', 'g-3'));
    await expect(tab(page, 'Play')).toHaveAttribute('aria-current', 'true');
    await page.getByRole('button', { name: 'Delete this game' }).click();
    await expect(page).toHaveURL(hrefOf('history'));
    await page.goBack();
    await expect(page).toHaveURL(hrefOf('play'));
    await expect(page.getByRole('main', { name: 'Play' })).toBeFocused();
});

test('says what will appear there and how to start a game while no game has finished', async ({
    page,
}) => {
    await seeded(page, []);
    await page.goto(hrefOf('history'));
    await expect(page.getByText('No finished games yet.', { exact: false })).toBeVisible();
    await audit(page);
    await page.getByRole('link', { name: 'Start a game' }).click();
    await expect(page).toHaveURL(hrefOf('play'));
});
