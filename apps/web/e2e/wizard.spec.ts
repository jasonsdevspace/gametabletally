import { hrefOf, newGameOf } from '../src/routes.js';
import type { SavedGame, SavedPlayer } from '../src/store/format.js';
import { appLine, audit, buildGame, expect, type Page, seed, test } from './support.js';

/*
 * A game of Wizard, as deployed: the one test that plays a game through on a phone, with six
 * players, which makes it the shortest game, from starting it to its recap, the bids set on the
 * steppers, shown through the hand and kept through a reload, the tricks started at the bids and
 * saved once they add up, and the audit on every screen of the first round and the recap. And,
 * from a seeded game, a saved round opened again with its bids and its tricks, and the errors of a
 * bid typed past its range and of one left blank, each said after its field's name.
 */

const NAMES = ['Ann', 'Ben', 'Cat', 'Dee', 'Eve', 'Fay'];

const player = (name: string): SavedPlayer => ({
    id: name.toLowerCase(),
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const dock = (page: Page) => page.getByRole('region', { name: 'Actions' });
const eyebrow = (page: Page) => page.locator('.gtt-wizard-title .dk-eyebrow');

test('plays a game of Wizard with six players through, from its start to its recap', async ({
    page,
}, info) => {
    test.skip(info.project.name !== 'phone', 'A game is played on a phone.');
    await page.goto('/');
    await seed(page, [], NAMES.map(player));
    await page.goto(hrefOf('play'));
    await page.locator('a[data-game="wizard"]').click();
    await expect(page).toHaveURL(newGameOf('wizard'));
    for (const name of NAMES) await page.getByRole('button', { name: `Add ${name}` }).click();
    await page.getByRole('button', { name: 'Start the game' }).click();

    // The first round: Ann bids one on the stepper, which stops at the one card dealt.
    await expect(page.locator('.gtt-wizard-round')).toHaveText('Round 1 of 10');
    await expect(eyebrow(page)).toHaveText('1 card each, Ann deals');
    const raise = page.getByRole('button', { name: "Raise Ann's bid" });
    await raise.click();
    await expect(page.locator('#bid-ann')).toHaveValue('1');
    await expect(raise).toHaveAttribute('aria-disabled', 'true');
    await audit(page);
    await dock(page).getByRole('button', { name: 'Save the bids' }).click();

    // The bids stand through the hand, and through a reload.
    await expect(
        page.getByRole('heading', { name: 'The bids, while the hand is played' })
    ).toBeVisible();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByRole('listitem').filter({ hasText: 'Ann' })).toContainText('1');
    await audit(page);
    await dock(page).getByRole('button', { name: 'Enter the tricks' }).click();

    // The tricks start at the bids, so the bid made costs no taps.
    await expect(page.locator('#tricks-ann')).toHaveValue('1');
    await expect(page.getByText('Every trick is in, 1 of 1.')).toBeVisible();
    await audit(page);
    await dock(page).getByRole('button', { name: 'Save the round' }).click();
    await expect(page.locator('.dk-app-toast').getByRole('status')).toContainText(
        'Round 1 saved. Ann 30, made a bid of 1. Ben 20, made a bid of 0.'
    );

    // Every round after: every bid nothing, and Ann takes every trick, so she misses hers.
    for (let round = 2; round <= 10; round += 1) {
        await expect(page.locator('.gtt-wizard-round')).toHaveText(`Round ${String(round)} of 10`);
        await expect(eyebrow(page)).toHaveText(
            `${String(round)} cards each, ${NAMES[(round - 1) % NAMES.length] ?? ''} deals`
        );
        await dock(page).getByRole('button', { name: 'Save the bids' }).click();
        await dock(page).getByRole('button', { name: 'Enter the tricks' }).click();
        const save = dock(page).getByRole('button', { name: 'Save the round' });
        await expect(save).toHaveAttribute('aria-disabled', 'true');
        await expect(save).toHaveAccessibleDescription(
            `${String(round)} tricks still to enter, of ${String(round)} in the hand.`
        );
        await page.locator('#tricks-ann').fill(String(round));
        await save.click();
    }

    await expect(page).toHaveURL(/\/recap\/\?id=/);
    await expect(
        page.getByText('Ben, Cat, Dee, Eve and Fay share the win, level on 200.')
    ).toBeVisible();
    await audit(page);
});

const zeroBids = (ids: readonly string[], bid: (at: number) => number) =>
    ids.map((one, at) => ({ step: { part: 'bid', player: one } as const, value: bid(at) }));
const tricksOf = (ids: readonly string[], took: (at: number) => number) =>
    ids.map((one, at) => ({ step: { part: 'tricks', player: one } as const, value: took(at) }));

/** A game of Wizard with three players and one round saved, Ann bidding one and taking it. */
const oneRound = (): Promise<SavedGame> => {
    const ids = ['ann', 'ben', 'cat'];
    return buildGame(
        { id: 'g-1', game: 'wizard', rules: 1, options: {}, players: ids },
        async (model) => {
            await model.enterAll(
                'g-1',
                zeroBids(ids, (at) => (at === 0 ? 1 : 0))
            );
            await model.saveRound(
                'g-1',
                undefined,
                tricksOf(ids, (at) => (at === 0 ? 1 : 0))
            );
        }
    );
};

test('opens a saved round again with its bids and its tricks, and saves a change to them', async ({
    page,
}) => {
    await page.goto('/');
    await seed(page, [await oneRound()], ['Ann', 'Ben', 'Cat'].map(player));
    await page.goto(hrefOf('scores', 'g-1'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await page.getByRole('button', { name: 'Change Round 1' }).click();
    await expect(page.locator('#bid-ann')).toHaveValue('1');
    await dock(page).getByRole('button', { name: 'Save the bids' }).click();
    // A saved round has its tricks, so it goes from its bids straight to them.
    await expect(page.locator('#tricks-ann')).toHaveValue('1');
    await page.getByRole('button', { name: "Lower Ann's tricks" }).click();
    await page.getByRole('button', { name: "Raise Ben's tricks" }).click();
    await dock(page).getByRole('button', { name: 'Save round 1' }).click();
    await expect(page).toHaveURL(/\/scores\/\?id=g-1&round=1$/);
    // Ann and Ben now each miss their bid by one, so Cat, who made hers, leads.
    await expect(page.getByText('Cat leads with 20.')).toBeVisible();
    await audit(page);
});

test('shows the error of a count typed past its range and of one left blank, with the field named first', async ({
    page,
}) => {
    const ids = ['ann', 'ben', 'cat'];
    const fresh = await buildGame({
        id: 'g-1',
        game: 'wizard',
        rules: 1,
        options: {},
        players: ids,
    });
    await page.goto('/');
    await seed(page, [fresh], ['Ann', 'Ben', 'Cat'].map(player));
    await page.goto(hrefOf('game', 'g-1'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    const ann = page.getByRole('spinbutton', { name: 'Ann deals, bid', exact: true });
    await ann.fill('7');
    await ann.press('Tab');
    await expect(page.locator('#bid-ann-range')).toBeVisible();
    await expect(appLine(page)).toHaveText('Ann deals, bid: Error: Enter a number from 0 to 1.');
    // Every count is required, so a blank one is wrong as well.
    const ben = page.getByRole('spinbutton', { name: 'Ben, bid', exact: true });
    await ben.fill('');
    await ben.press('Tab');
    await expect(page.locator('#bid-ben-range')).toBeVisible();
    await expect(appLine(page)).toHaveText('Ben, bid: Error: Enter a number from 0 to 1.');
    await expect(page.locator('#bid-cat-range')).toBeHidden();
    await audit(page);
    // With Ann's bid put right, the blank alone holds the round.
    await ann.fill('1');
    const save = dock(page).getByRole('button', { name: 'Save the bids' });
    await expect(save).toHaveAttribute('aria-disabled', 'true');
    await expect(save).toHaveAccessibleDescription("Ben's bid can be from 0 to 1.");
});
