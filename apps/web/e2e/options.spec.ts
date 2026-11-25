import { newGameOf } from '../src/app/PlayStart.js';
import { hrefOf } from '../src/routes.js';
import type { SavedPlayer } from '../src/store/format.js';
import { appLine, audit, buildGame, expect, type Page, seed, test } from './support.js';

/*
 * A game's rule options, as deployed: chosen by keyboard on the screen that starts a game, with the
 * audit on it, a game of Skyjo played to a lower target and named for it in its recap and its row
 * in the history, and Wizard's bid screen saying which bid the dealer cannot make under Plus or
 * minus one before it is made.
 */

const NAMES = ['Ann', 'Ben', 'Cat'];

const player = (name: string): SavedPlayer => ({
    id: name.toLowerCase(),
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const dock = (page: Page) => page.getByRole('region', { name: 'Actions' });
const pad = (page: Page) => page.getByRole('toolbar', { name: 'Number pad' });

/** Presses Tab until the element given has focus, as a keyboard reaches it. */
const tabTo = async (page: Page, target: ReturnType<Page['getByRole']>) => {
    for (let press = 0; press < 10; press += 1) {
        await page.keyboard.press('Tab');
        if (await target.evaluate((element) => element === document.activeElement)) return;
    }
    throw new Error('The field was not reached by Tab.');
};

test('chooses a lower target by keyboard, plays to it, and names it in the recap and the history', async ({
    page,
}) => {
    await page.goto('/');
    await seed(page, [], NAMES.map(player));
    await page.goto(newGameOf('skyjo'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    for (const name of ['Ann', 'Ben'])
        await page.getByRole('button', { name: `Add ${name}` }).click();
    const target = page.getByRole('combobox', { name: 'Target score' });
    await expect(target).toHaveValue('100');
    await audit(page);
    await page.getByRole('button', { name: 'Add', exact: true }).focus();
    await tabTo(page, target);
    await page.keyboard.type('5');
    await expect(target).toHaveValue('50');
    await dock(page).getByRole('button', { name: 'Start the game' }).click();
    await expect(page).toHaveURL(/\/game\/\?id=/);

    // One round takes Ann past fifty, which ends the game at the lower target.
    await pad(page).getByRole('button', { name: '6', exact: true }).click();
    await pad(page).getByRole('button', { name: '0', exact: true }).click();
    await dock(page).getByRole('button', { name: 'Next: Ben' }).click();
    await pad(page).getByRole('button', { name: '4', exact: true }).click();
    await dock(page).getByRole('button', { name: 'Next: who ended the round' }).click();
    await page.getByRole('radio', { name: /^Ben/ }).check();
    await dock(page).getByRole('button', { name: 'Save the round' }).click();
    await expect(page).toHaveURL(/\/recap\/\?id=/);
    await expect(page.getByText('Ben wins with 4.')).toBeVisible();
    await expect(
        page.getByText('This game of Skyjo is over. Played with a target score of 50.')
    ).toBeVisible();
    await audit(page);

    await page.goto(hrefOf('history'));
    await expect(
        page.getByRole('list', { name: 'Finished games' }).getByRole('link')
    ).toContainText('Ann and Ben. Played with a target score of 50.');
});

test("turns Wizard's Plus or minus one on by keyboard, with the audit on the screen", async ({
    page,
}) => {
    await page.goto('/');
    await seed(page, [], NAMES.map(player));
    await page.goto(newGameOf('wizard'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    for (const name of NAMES) await page.getByRole('button', { name: `Add ${name}` }).click();
    const rule = page
        .getByRole('group', { name: 'Plus or minus one' })
        .getByRole('checkbox', { name: 'Plus or minus one' });
    await expect(rule).not.toBeChecked();
    await page.getByRole('button', { name: 'Add', exact: true }).focus();
    await tabTo(page, rule);
    await page.keyboard.press('Space');
    await expect(rule).toBeChecked();
    await audit(page);
    await dock(page).getByRole('button', { name: 'Start the game' }).click();
    await expect(page.locator('.gtt-wizard-round')).toHaveText('Round 1 of 20');
});

test('says which bid the dealer cannot make under Plus or minus one, before it is made', async ({
    page,
}) => {
    const game = await buildGame(
        {
            id: 'g-1',
            game: 'wizard',
            rules: 1,
            options: { 'plus-minus-one': true },
            players: ['ann', 'ben', 'cat'],
        },
        async (model) => {
            const all = (part: 'bid' | 'tricks', values: readonly number[]) =>
                ['ann', 'ben', 'cat'].map((one, at) => ({
                    step: { part, player: one },
                    value: values[at],
                }));
            await model.enterAll('g-1', all('bid', [1, 1, 1]));
            await model.saveRound('g-1', undefined, all('tricks', [1, 0, 0]));
        }
    );
    await page.goto('/');
    await seed(page, [game], NAMES.map(player));
    await page.goto(hrefOf('game', 'g-1'));
    await expect(page.locator('.gtt-wizard-round')).toHaveText('Round 2 of 20');
    await page.getByRole('button', { name: "Raise Ann's bid" }).click();
    const why =
        'The bids may not add up to 2, the cards each player holds, so Ben, bidding last, cannot bid 1.';
    // Cat has not bid, so the 0 shown is no bid yet, and nothing is said of Ben's.
    await expect(page.getByText(why)).toBeHidden();
    const save = dock(page).getByRole('button', { name: 'Save the bids' });
    await expect(save).not.toHaveAttribute('aria-disabled');
    // A press on Ben's stepper lands on the bid he cannot make, which is shown and said with it.
    await page.getByRole('button', { name: "Raise Ben's bid" }).click();
    await expect(page.getByText(why)).toBeVisible();
    await expect(appLine(page)).toContainText(why);
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(save).toHaveAccessibleDescription(why);
    await expect(page.locator('#bid-ben')).toHaveAccessibleDescription(new RegExp(why));
    await audit(page);
});
