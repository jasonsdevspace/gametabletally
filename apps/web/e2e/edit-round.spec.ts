import { hrefOf } from '../src/routes.js';
import type { SavedGame, SavedPlayer } from '../src/store/format.js';
import {
    appLine,
    audit,
    buildGame,
    expect,
    type Page,
    seed,
    smallTargets,
    test,
} from './support.js';

/*
 * An earlier round changed from the scores page, as deployed: each saved round's heading opens it
 * on the round's own screen, filled with what was entered and named in the bar, a change saved
 * moves every total after it and is followed by its summary with Undo, a change let go leaves the
 * round as it was, a change the rules refuse is said in words and not saved, and focus goes back to
 * the round's heading each time.
 */

const NAMES = ['Ann', 'Ben', 'Cat'];

const player = (name: string): SavedPlayer => ({
    id: name.toLowerCase(),
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const hand = (numbers: number[]) => ({ numbers, modifiers: [], bust: false });

/** A game of Flip 7 with three rounds saved and the fourth not yet begun. */
const threeRounds = (): Promise<SavedGame> =>
    buildGame(
        { id: 'g-1', game: 'flip-7', rules: 1, options: {}, players: ['ann', 'ben', 'cat'] },
        async (model) => {
            for (const round of [
                [hand([3]), hand([4]), hand([5])],
                [hand([6]), hand([7]), hand([8])],
                [hand([1]), hand([2]), hand([9])],
            ]) {
                for (const one of round) await model.enter('g-1', one);
                await model.saveRound('g-1');
            }
        }
    );

const openScores = async (page: Page) => {
    await page.goto('/');
    await seed(page, [await threeRounds()], NAMES.map(player));
    await page.goto(hrefOf('scores', 'g-1'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByRole('list', { name: 'Standings' })).toBeVisible();
};

const heading = (page: Page, round: number) =>
    page.getByRole('button', { name: `Change Round ${String(round)}` });
const key = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const dock = (page: Page) => page.getByRole('region', { name: 'Actions' });
const bar = (page: Page) => page.locator('#screen-title');
const row = (page: Page, name: string) =>
    page.getByRole('table', { name: 'Scores by round, newest first' }).getByRole('row', {
        name: new RegExp(`^${name}`),
    });

/** Opens a round from its heading and waits for its screen, named in the bar. */
const change = async (page: Page, round: number) => {
    await heading(page, round).click();
    await expect(bar(page)).toHaveText(`Changing round ${String(round)}`);
};

test('opens a saved round from its heading, filled with what was entered and named in the bar', async ({
    page,
}) => {
    await openScores(page);
    expect(await smallTargets(page)).toEqual([]);
    await change(page, 1);
    await expect(page.locator('#main')).toBeFocused();
    await expect(page.locator('.gtt-score-name')).toHaveText('Ann');
    await expect(key(page, '3')).toHaveAttribute('aria-pressed', 'true');
    await expect(
        dock(page).getByRole('button', { name: 'Cancel the change to round 1' })
    ).toBeVisible();
    await audit(page);
});

test('saves a change to the first round, moves every total after it, and goes back to its heading with Undo', async ({
    page,
}) => {
    await openScores(page);
    await expect(row(page, 'Ann')).toContainText('Ann, 10 in all');
    await change(page, 1);
    await key(page, '10').click();
    await dock(page).getByRole('button', { name: 'Next: Ben' }).click();
    await dock(page).getByRole('button', { name: 'Next: Cat' }).click();
    await dock(page).getByRole('button', { name: 'Save round 1' }).click();
    await expect(page).toHaveURL(/\/scores\//);
    await expect(heading(page, 1)).toBeFocused();
    await expect(row(page, 'Ann')).toContainText('Ann, 20 in all');
    const toast = page.locator('.dk-app-toast');
    await expect(toast.getByRole('status')).toContainText('Round 1 saved. Ann 13.');
    await toast.getByRole('button', { name: 'Undo' }).click();
    await expect(row(page, 'Ann')).toContainText('Ann, 10 in all');
    // Undo leaves the round in play as it was, with no round left open to change.
    await dock(page).getByRole('link', { name: 'Back to round 4' }).click();
    await expect(bar(page)).toHaveText('Game in play');
    await expect(page.locator('.gtt-score-name')).toHaveText('Ann');
    await expect(key(page, '3')).toHaveAttribute('aria-pressed', 'false');
});

test("names the round being changed in the page's title as well as the bar, from the moment it opens", async ({
    page,
}) => {
    await openScores(page);
    await heading(page, 2).click();
    await expect(page).toHaveTitle('Changing round 2, Game Table Tally');
    await expect(page.locator('#main')).toBeFocused();
    await expect(page.locator('#main')).toHaveAccessibleName('Changing round 2');
});

test('takes a summary from an earlier save away as a round is opened, so its Undo cannot reach past it', async ({
    page,
}) => {
    await openScores(page);
    await change(page, 1);
    await key(page, '10').click();
    for (const name of ['Next: Ben', 'Next: Cat', 'Save round 1'])
        await dock(page).getByRole('button', { name }).click();
    const toast = page.locator('.dk-app-toast .dk-toast');
    await expect(toast).toHaveAttribute('data-shown');
    await change(page, 2);
    await expect(toast).not.toHaveAttribute('data-shown');
});

test('leaves the round as it was when the change is let go, and goes back to its heading', async ({
    page,
}) => {
    await openScores(page);
    await change(page, 2);
    await key(page, '12').click();
    await dock(page).getByRole('button', { name: 'Cancel the change to round 2' }).click();
    await expect(heading(page, 2)).toBeFocused();
    await expect(row(page, 'Ann')).toContainText('Ann, 10 in all');
    await page.goto(hrefOf('game', 'g-1'));
    await expect(bar(page)).toHaveText('Game in play');
    await expect(key(page, '12')).toHaveAttribute('aria-pressed', 'false');
});

test('says a change the rules refuse in words, and does not save it', async ({ page }) => {
    await openScores(page);
    await change(page, 1);
    for (const card of ['0', '1', '2', '4', '5', '6', '7']) await key(page, card).click();
    await expect(
        page.getByText('A round ends at 7 numbers, so a hand holds no more.', { exact: false })
    ).toBeVisible();
    await expect(dock(page).getByRole('button', { name: 'Next: Ben' })).toHaveAttribute(
        'aria-disabled',
        'true'
    );
    await dock(page).getByRole('button', { name: 'Cancel the change to round 1' }).click();
    await expect(row(page, 'Ann')).toContainText('Ann, 10 in all');
});

test('says why a round cannot be opened while the round in play holds an entry', async ({
    page,
}) => {
    await page.goto('/');
    await seed(page, [await threeRounds()], NAMES.map(player));
    await page.goto(hrefOf('game', 'g-1'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await key(page, '4').click();
    await dock(page).getByRole('link', { name: 'Scores' }).click();
    await heading(page, 1).click();
    await expect(appLine(page)).toHaveText('Save or let go of the round being entered first.');
    await expect(page).toHaveURL(/\/scores\//);
});

test('opens the recap when a changed round ends the game', async ({ page }) => {
    await openScores(page);
    await change(page, 3);
    for (const card of ['12', '11', '10', '9', '8', '7', 'Times 2', '+10'])
        await key(page, card).click();
    for (const name of ['Next: Ben', 'Next: Cat'])
        await dock(page).getByRole('button', { name }).click();
    // One such round takes Ann to 150, short of two hundred, so the game goes on.
    await dock(page).getByRole('button', { name: 'Save round 3' }).click();
    await expect(page).toHaveURL(/\/scores\//);
    await change(page, 2);
    // Ann's 6 is held already, so six more numbers make seven.
    for (const card of ['12', '11', '10', '9', '8', '7', 'Times 2', '+10'])
        await key(page, card).click();
    for (const name of ['Next: Ben', 'Next: Cat'])
        await dock(page).getByRole('button', { name }).click();
    await dock(page).getByRole('button', { name: 'Save round 2' }).click();
    await expect(page).toHaveURL(/\/recap\/\?id=g-1&round=2$/);
    await expect(page.getByText(/^Ann wins with/)).toBeVisible();
});
