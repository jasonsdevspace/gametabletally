import { newGameOf } from '../src/app/PlayStart.js';
import { hrefOf } from '../src/routes.js';
import type { SavedGame, SavedPlayer } from '../src/store/format.js';
import { audit, buildGame, expect, type Page, seed, test } from './support.js';

/*
 * A game of Skyjo, as deployed: the one test that plays a game through on a phone, from starting
 * it to its recap, with totals typed on the number pad, one added up from the cards, a round whose
 * ender is doubled, and the audit on every screen it reaches, and, from a seeded game, a saved
 * round opened again with what was entered and who ended it.
 */

const NAMES = ['Ann', 'Ben', 'Cat'];

const player = (name: string): SavedPlayer => ({
    id: name.toLowerCase(),
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const dock = (page: Page) => page.getByRole('region', { name: 'Actions' });
const pad = (page: Page) => page.getByRole('group', { name: 'Number pad' });
const scoring = (page: Page) => page.locator('.gtt-score-name');

/** Types a total on the number pad, a minus sign first where it is below zero. */
const typeTotal = async (page: Page, total: number) => {
    if (total < 0) await pad(page).getByRole('button', { name: 'Minus' }).click();
    for (const digit of String(Math.abs(total)))
        await pad(page).getByRole('button', { name: digit, exact: true }).click();
};

/** Says who ended the round and saves it. */
const ended = async (page: Page, name: string) => {
    await page.getByRole('radio', { name: new RegExp(`^${name}`) }).check();
    await dock(page).getByRole('button', { name: 'Save the round' }).click();
};

test('plays a game of Skyjo through, typing totals and adding up cards, to its recap', async ({
    page,
}, info) => {
    test.skip(info.project.name !== 'phone', 'A game is played on a phone.');
    await page.goto('/');
    await seed(page, [], NAMES.map(player));
    await page.goto(hrefOf('play'));
    await page.locator('a[data-game="skyjo"]').click();
    await expect(page).toHaveURL(newGameOf('skyjo'));
    for (const name of NAMES) await page.getByRole('button', { name: `Add ${name}` }).click();
    await page.getByRole('button', { name: 'Start the game' }).click();
    await expect(scoring(page)).toHaveText('Ann');

    // The first round: the next player is out of reach until a total is typed.
    await expect(dock(page).getByRole('button', { name: 'Next: Ben' })).toBeDisabled();
    await audit(page);
    await typeTotal(page, 5);
    await dock(page).getByRole('button', { name: 'Next: Ben' }).click();
    // Ben's cards are added up for him, one taken out again from the strip.
    await page.getByRole('tab', { name: 'Add it up for me' }).click();
    const cards = page.getByRole('group', { name: 'Cards', exact: true });
    for (const card of ['12', 'minus 2', '7'])
        await cards.getByRole('button', { name: card }).click();
    await page
        .getByRole('group', { name: 'Cards tapped in' })
        .getByRole('button', { name: 'Take out 7' })
        .click();
    await expect(page.getByRole('group', { name: 'Cards tapped in, 10 in all' })).toBeVisible();
    await audit(page);
    await dock(page).getByRole('button', { name: 'Next: Cat' }).click();
    await typeTotal(page, 20);
    await dock(page).getByRole('button', { name: 'Next: who ended the round' }).click();
    await expect(page.getByRole('radiogroup', { name: 'Who ended the round?' })).toBeVisible();
    await expect(dock(page).getByRole('button', { name: 'Save the round' })).toBeDisabled();
    await audit(page);
    await ended(page, 'Ann');
    await expect(scoring(page)).toHaveText('Ann');

    // The second round: Ann ends it without the lowest score alone, so her 30 doubles.
    await typeTotal(page, 30);
    await dock(page).getByRole('button', { name: 'Next: Ben' }).click();
    await typeTotal(page, 8);
    await dock(page).getByRole('button', { name: 'Next: Cat' }).click();
    await typeTotal(page, 25);
    await dock(page).getByRole('button', { name: 'Next: who ended the round' }).click();
    await page.getByRole('radio', { name: /^Ann/ }).check();
    await expect(
        page.getByText("Ann's 30 doubles to 60, since Ben and Cat have as little or less.")
    ).toBeVisible();
    await dock(page).getByRole('button', { name: 'Save the round' }).click();
    await expect(page.locator('.dk-app-toast').getByRole('status')).toContainText(
        'Ann 60, doubled from 30, for ending the round without the lowest score alone.'
    );
    await audit(page);

    // The third round takes Ann and Cat past a hundred, which ends the game with Ben ahead.
    await typeTotal(page, 40);
    await dock(page).getByRole('button', { name: 'Next: Ben' }).click();
    await typeTotal(page, 3);
    await dock(page).getByRole('button', { name: 'Next: Cat' }).click();
    await typeTotal(page, 70);
    await dock(page).getByRole('button', { name: 'Next: who ended the round' }).click();
    await ended(page, 'Ben');
    await expect(page).toHaveURL(/\/recap\/\?id=/);
    await expect(page.getByText('Ben wins with 21.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Standings' }).getByRole('listitem')).toHaveText([
        'Ben, 1st place, 21 points',
        'Ann, 2nd place, 105 points',
        'Cat, 3rd place, 115 points',
    ]);
    await audit(page);
});

/** A game of Skyjo with one round saved, Ben's added up from his cards and Ann ending it. */
const oneRound = (): Promise<SavedGame> =>
    buildGame(
        { id: 'g-1', game: 'skyjo', rules: 1, options: {}, players: ['ann', 'ben', 'cat'] },
        async (model) => {
            await model.enter('g-1', { total: 5 });
            await model.enter('g-1', { cards: [12, -2] });
            await model.enter('g-1', { total: 20 });
            await model.enter('g-1', 'ann');
            await model.saveRound('g-1');
        }
    );

test('opens a saved round again with what was entered and who ended it', async ({ page }) => {
    await page.goto('/');
    await seed(page, [await oneRound()], NAMES.map(player));
    await page.goto(hrefOf('scores', 'g-1'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await page.getByRole('button', { name: 'Change Round 1' }).click();
    await expect(scoring(page)).toHaveText('Ann');
    await expect(page.locator('.gtt-score-line')).toHaveText('5 this round.');
    await dock(page).getByRole('button', { name: 'Next: Ben' }).click();
    await expect(page.getByRole('tab', { name: 'Add it up for me' })).toHaveAttribute(
        'aria-selected',
        'true'
    );
    await expect(page.getByRole('group', { name: 'Cards tapped in, 10 in all' })).toBeVisible();
    await dock(page).getByRole('button', { name: 'Next: Cat' }).click();
    await dock(page).getByRole('button', { name: 'Next: who ended the round' }).click();
    await expect(page.getByRole('radio', { name: /^Ann/ })).toBeChecked();
    await page.getByRole('radio', { name: /^Cat/ }).check();
    await dock(page).getByRole('button', { name: 'Save round 1' }).click();
    await expect(page).toHaveURL(/\/scores\/\?id=g-1&round=1$/);
    await audit(page);
});
