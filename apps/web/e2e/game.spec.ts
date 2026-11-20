import type { Locator } from '@playwright/test';

import { hrefOf } from '../src/routes.js';
import type { SavedGame, SavedPlayer } from '../src/store/format.js';
import { appLine, audit, expect, type Page, seed, smallTargets, test } from './support.js';

/*
 * The game in play, as deployed: a round of Flip 7 entered player by player on a phone by tapping
 * cards, with Bust taken back, the bonus named and the round saved after the last player, a hand
 * kept through a reload, a hand the rules refuse said in words beside the keys, every key at the
 * target, the score header's digits on the narrowest phone for totals of every length, and the
 * summary after each entry and each save, with its Undo, clear of the keys at twice the text size.
 */

const NAMES = ['Ann', 'Ben', 'Cat'];

const player = (name: string): SavedPlayer => ({
    id: name.toLowerCase(),
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

/** A game of Flip 7 or Skyjo with the rounds given saved, at the first seat of the next round. */
const game = (kind: 'flip-7' | 'skyjo', rounds: readonly unknown[] = []): SavedGame => ({
    id: 'g-1',
    game: kind,
    rules: 1,
    options: {},
    players: NAMES.map((name) => name.toLowerCase()),
    rounds,
    draft: {
        index: rounds.length,
        round: { entries: {}, out: [] },
        step: { part: 'entry', player: 'ann' },
    },
    started: '2026-11-14T10:00:00Z',
    changed: '2026-11-14T10:00:00Z',
});

const open = async (page: Page, saved: SavedGame = game('flip-7')) => {
    await page.goto('/');
    await seed(page, [saved], NAMES.map(player));
    await page.goto(hrefOf('game', saved.id));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
};

const key = (page: Page, name: string) => page.getByRole('button', { name, exact: true });

const total = (page: Page) => page.locator('.gtt-digits');
const next = (page: Page) => page.getByRole('region', { name: 'Actions' }).getByRole('button');

test('enters a round of Flip 7 by tapping cards, player by player, and saves it after the last', async ({
    page,
}, info) => {
    test.skip(info.project.name !== 'phone', 'A round is entered on a phone.');
    await open(page);
    await expect(page.locator('.gtt-score-name')).toHaveText('Ann');
    for (const card of ['3', '7', '+4']) await key(page, card).click();
    await expect(total(page)).toHaveAccessibleName('14');
    await expect(page.locator('.gtt-score-line')).toHaveText('14 this round.');
    await expect(key(page, '7')).toHaveAttribute('aria-pressed', 'true');
    await audit(page);
    await expect(next(page)).toHaveText('Next: Ben');
    await next(page).click();

    await expect(page.locator('.gtt-score-name')).toHaveText('Ben');
    await key(page, '5').click();
    await key(page, 'Bust').click();
    await expect(key(page, 'Bust')).toHaveAttribute('aria-pressed', 'true');
    await expect(key(page, 'Bust')).toHaveAccessibleDescription(
        'Ben bust, so nothing counts this round. Press Bust again to take it back.'
    );
    await expect(key(page, '5')).toHaveAttribute('aria-pressed', 'false');
    await expect(total(page)).toHaveAccessibleName('0');
    await audit(page);
    await key(page, 'Bust').click();
    await expect(key(page, 'Bust')).toHaveAttribute('aria-pressed', 'false');
    await key(page, 'Bust').click();
    await next(page).click();

    await expect(page.locator('.gtt-score-name')).toHaveText('Cat');
    for (const card of ['0', '1', '2', '3', '4', '5', '6']) await key(page, card).click();
    await expect(page.locator('.gtt-score-line')).toHaveText(
        '36 this round, with 15 for 7 numbers.'
    );
    await expect(total(page)).toHaveAccessibleName('36');
    await expect(next(page)).toHaveText('Save the round');
    await next(page).click();

    // The next round opens at the first seat, with the saved round in the totals.
    await expect(page.locator('.gtt-score-name')).toHaveText('Ann');
    await expect(total(page)).toHaveAccessibleName('14');
    await expect(page.locator('.gtt-score-line')).toHaveText(
        '14 before this round, and 0 this round.'
    );
});

test('comes back to the same player with the same cards after a reload', async ({ page }) => {
    await open(page);
    await next(page).click();
    await key(page, '9').click();
    await key(page, 'Times 2').click();
    // The header's total is worked out from what was kept, so it shows the hand is saved.
    await expect(total(page)).toHaveAccessibleName('18');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.gtt-score-name')).toHaveText('Ben');
    await expect(key(page, '9')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('button', { name: 'Times 2' })).toHaveAttribute(
        'aria-pressed',
        'true'
    );
});

test('says in words beside the keys why a hand of eight numbers is refused, and holds the next player', async ({
    page,
}) => {
    await open(page);
    for (const card of ['0', '1', '2', '3', '4', '5', '6', '7']) await key(page, card).click();
    const why = 'A round ends at 7 numbers, so a hand holds no more. Take one off.';
    await expect(page.getByText(why)).toBeVisible();
    await expect(appLine(page)).toHaveText(why);
    // The header keeps the last score the rules took, so a refusal never reads as nothing.
    await expect(total(page)).toHaveAccessibleName('36');
    await audit(page);
    await expect(page.getByRole('toolbar', { name: 'Number cards' })).toHaveAccessibleDescription(
        why
    );
    await expect(next(page)).toHaveAttribute('aria-disabled', 'true');
    await key(page, '7').click();
    await expect(page.getByText(why)).toHaveCount(0);
    await expect(next(page)).not.toHaveAttribute('aria-disabled', 'true');
});

test('draws every key at the target both ways on the narrowest phone, and the next player larger', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    expect(await smallTargets(page)).toEqual([]);
    const main = await next(page).boundingBox();
    const card = await key(page, '0').boundingBox();
    expect(main?.height ?? 0).toBeGreaterThan(card?.height ?? 0);
});

for (const [kind, rounds, shown] of [
    ['flip-7', [], '0'],
    [
        'flip-7',
        [
            {
                entries: {
                    ann: { numbers: [12, 11], modifiers: ['x2'], bust: false },
                    ben: { numbers: [], modifiers: [], bust: true },
                    cat: { numbers: [], modifiers: [], bust: true },
                },
            },
        ],
        '46',
    ],
    [
        'flip-7',
        [
            {
                entries: {
                    ann: {
                        numbers: [12, 11, 10, 9, 8, 7, 6],
                        modifiers: ['x2', '+10'],
                        bust: false,
                    },
                    ben: { numbers: [], modifiers: [], bust: true },
                    cat: { numbers: [], modifiers: [], bust: true },
                },
            },
        ],
        '151',
    ],
    [
        'skyjo',
        [
            {
                entries: { ann: { total: -12 }, ben: { total: 40 }, cat: { total: 30 } },
                ender: 'ann',
            },
        ],
        'minus 12',
    ],
] as const)
    test(`fits a total of ${shown} in the score header on the narrowest phone`, async ({
        page,
    }) => {
        await page.setViewportSize({ width: 320, height: 640 });
        await open(page, game(kind, rounds));
        await expect(total(page)).toHaveAccessibleName(shown);
        const digits = await total(page).boundingBox();
        expect((digits?.x ?? 0) + (digits?.width ?? 0)).toBeLessThanOrEqual(320);
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
            320
        );
    });

test('keeps focus on the button for the next player as the turn moves on, and says who is next and the saved round', async ({
    page,
}) => {
    await open(page);
    await next(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.gtt-score-name')).toHaveText('Ben');
    await expect(page.getByRole('button', { name: 'Next: Cat' })).toBeFocused();
    await expect(appLine(page)).toHaveText('Ben is next.');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Save the round' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('.gtt-score-name')).toHaveText('Ann');
    await expect(page.locator('.dk-app-toast').getByRole('status')).toContainText('Round 1 saved.');
    await expect(page.getByRole('button', { name: 'Next: Ben' })).toBeFocused();
});

test('sets the keys at the foot of the body on a tall phone, in reach of a thumb', async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    const modifiers = await page.getByRole('toolbar', { name: 'Modifier cards' }).boundingBox();
    const dock = await page.getByRole('region', { name: 'Actions' }).boundingBox();
    // The last row of keys ends a step or two above the dock, with the spare room above the keys.
    expect((dock?.y ?? 0) - ((modifiers?.y ?? 0) + (modifiers?.height ?? 0))).toBeLessThan(48);
});

test('draws the six modifier cards in two even rows of three on the narrowest phone', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    const tops = await page
        .getByRole('toolbar', { name: 'Modifier cards' })
        .getByRole('button')
        .evaluateAll((cards) => cards.map((card) => Math.round(card.getBoundingClientRect().top)));
    expect(tops).toHaveLength(6);
    expect(tops.filter((top) => top === tops[0])).toHaveLength(3);
    expect(tops.filter((top) => top === tops[5])).toHaveLength(3);
});

test('opens the recap, with focus on it, when the last round of the game is saved', async ({
    page,
}) => {
    const bust = { numbers: [], modifiers: [], bust: true };
    await open(
        page,
        game('flip-7', [
            {
                entries: {
                    ann: {
                        numbers: [12, 11, 10, 9, 8, 7, 6],
                        modifiers: ['x2', '+10'],
                        bust: false,
                    },
                    ben: bust,
                    cat: bust,
                },
            },
        ])
    );
    for (const card of ['12', '11', '10', 'Times 2']) await key(page, card).click();
    await expect(total(page)).toHaveAccessibleName('217');
    await next(page).click();
    await key(page, 'Bust').click();
    await next(page).click();
    await key(page, 'Bust').click();
    await next(page).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`\\${hrefOf('recap', 'g-1').replace('?', '\\?')}$`));
    await expect(page.locator('#main')).toBeFocused();
    await expect(page.locator('#main')).toHaveAccessibleName('Recap');
    await expect(page.getByText('This game of Flip 7 is over.')).toBeVisible();
    await expect(page.locator('.dk-app-toast').getByRole('status')).toContainText('Round 2 saved.');
});

const toast = (page: Page) => page.locator('.dk-app-toast');
const undo = (page: Page) => toast(page).getByRole('button', { name: 'Undo' });
/** The toast itself, which carries `data-shown` while it shows. */
const shownToast = (page: Page) => toast(page).locator('.dk-toast');

/** Enters a round of Flip 7 for Ann, Ben and Cat, with a doubled hand, a bust and the bonus. */
const enterRound = async (page: Page) => {
    for (const card of ['3', '7', 'Times 2']) await key(page, card).click();
    await next(page).click();
    await key(page, 'Bust').click();
    await next(page).click();
    for (const card of ['1', '2', '3', '4', '5', '6', '7']) await key(page, card).click();
    await expect(next(page)).toHaveText('Save the round');
};

test('says what each player scored as a round is saved, and Undo puts it back at the last player', async ({
    page,
}) => {
    await open(page);
    await enterRound(page);
    await next(page).click();
    await expect(page.locator('.gtt-score-name')).toHaveText('Ann');
    await expect(toast(page).getByRole('status')).toContainText(
        'Round 1 saved. Ann 20, x2 doubled the numbers. Ben 0, bust. Cat 43, 15 for 7 numbers.'
    );
    await audit(page);
    await undo(page).click();
    // The round is back as it was being entered, at Cat, with her hand as it stood.
    await expect(page.locator('.gtt-score-name')).toHaveText('Cat');
    await expect(total(page)).toHaveAccessibleName('43');
    await expect(key(page, '7')).toHaveAttribute('aria-pressed', 'true');
    await expect(next(page)).toHaveText('Save the round');
    await expect(shownToast(page)).not.toHaveAttribute('data-shown');
});

test("takes back a player's entry within a round with the same toast, at their hand as it stood", async ({
    page,
}) => {
    await open(page);
    for (const card of ['5', '+4']) await key(page, card).click();
    await next(page).click();
    await expect(page.locator('.gtt-score-name')).toHaveText('Ben');
    await expect(toast(page).getByRole('status')).toContainText("Ann's entry is in: 9.");
    // Undo is reached by the keyboard, as any button is.
    await expect(undo(page)).not.toHaveAttribute('tabindex', '-1');
    await undo(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.gtt-score-name')).toHaveText('Ann');
    await expect(key(page, '5')).toHaveAttribute('aria-pressed', 'true');
    await expect(key(page, '+4')).toHaveAttribute('aria-pressed', 'true');
});

test('keeps the summary until the next entry begins', async ({ page }) => {
    await open(page);
    await key(page, '5').click();
    await next(page).click();
    await expect(shownToast(page)).toHaveAttribute('data-shown');
    await key(page, '8').click();
    await expect(shownToast(page)).not.toHaveAttribute('data-shown');
    await expect(key(page, '8')).toHaveAttribute('aria-pressed', 'true');
});

test('draws the summary clear of the keys, the dock and the tab bar on the narrowest phone at twice the text size', async ({
    page,
}) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await enterRound(page);
    await next(page).click();
    await expect(shownToast(page)).toHaveAttribute('data-shown');
    // Each key, the dock and the tab bar, once scrolled to, is what a tap at its middle reaches,
    // with no part of the summary over it.
    const clear = async (name: string, others: Locator) => {
        for (const other of await others.all()) {
            await other.scrollIntoViewIfNeeded();
            const reached = await other.evaluate((element) => {
                const { x, y, width, height } = element.getBoundingClientRect();
                const top = document.elementFromPoint(x + width / 2, y + height / 2);
                return top !== null && (element === top || element.contains(top));
            });
            expect(reached, name).toBe(true);
        }
    };
    await clear('a key', page.locator('.gtt-game .dk-button-grid button'));
    await clear('the dock', page.getByRole('region', { name: 'Actions' }).getByRole('button'));
    await clear(
        'the tab bar',
        page.getByRole('navigation', { name: 'Sections' }).getByRole('link')
    );
    await undo(page).scrollIntoViewIfNeeded();
    await expect(undo(page)).toBeInViewport({ ratio: 1 });
});

test('takes the summary away as the next player moves on with no tap, so Undo takes back their entry', async ({
    page,
}) => {
    await open(page);
    for (const card of ['5', '+4']) await key(page, card).click();
    await next(page).click();
    await expect(toast(page).getByRole('status')).toContainText("Ann's entry is in: 9.");
    // Ben moves on without a card, which is his entry, so the summary now speaks of his.
    await next(page).click();
    await expect(page.locator('.gtt-score-name')).toHaveText('Cat');
    await expect(toast(page).getByRole('status')).toContainText("Ben's entry is in: 0.");
    await undo(page).click();
    await expect(page.locator('.gtt-score-name')).toHaveText('Ben');
    await expect(shownToast(page)).not.toHaveAttribute('data-shown');
});

/** Moves to the players' screen by the tab bar, as a visitor might between two hands. */
const toPlayers = async (page: Page) => {
    await page
        .getByRole('navigation', { name: 'Sections' })
        .getByRole('link', { name: 'Players' })
        .click();
    await expect(page).toHaveURL(new RegExp(hrefOf('players')));
};

test('keeps the summary and its Undo working on another screen of the app', async ({ page }) => {
    await open(page);
    await key(page, '5').click();
    await next(page).click();
    await expect(shownToast(page)).toHaveAttribute('data-shown');
    await toPlayers(page);
    await expect(shownToast(page)).toHaveAttribute('data-shown');
    await undo(page).click();
    await page.goBack();
    await expect(page.locator('.gtt-score-name')).toHaveText('Ann');
    await expect(key(page, '5')).toHaveAttribute('aria-pressed', 'true');
});

test("takes a summary offered on an earlier visit away as the round's next entry begins", async ({
    page,
}) => {
    await open(page);
    await key(page, '5').click();
    await next(page).click();
    await toPlayers(page);
    await page.goBack();
    await expect(page.locator('.gtt-score-name')).toHaveText('Ben');
    await expect(shownToast(page)).toHaveAttribute('data-shown');
    await key(page, '8').click();
    await expect(shownToast(page)).not.toHaveAttribute('data-shown');
});

test('makes the numbers and the modifiers one stop each, with the arrow keys moving between their cards', async ({
    page,
}) => {
    await open(page);
    const card = (name: string) => page.getByRole('button', { name, exact: true });
    await card('Bust').focus();
    await page.keyboard.press('Tab');
    await expect(card('0')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(card('1')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(card('6')).toBeFocused();
    await page.keyboard.press('End');
    await expect(card('12')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(card('0')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(card('1')).toHaveAttribute('aria-pressed', 'true');
    // One Tab leaves the numbers for the modifiers, and one more leaves those for the dock.
    await page.keyboard.press('Tab');
    await expect(card('+2')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(card('+4')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Scores' })).toBeFocused();
    // Back through the modifiers and into the numbers, focus lands on the card last reached in each.
    await page.keyboard.press('Shift+Tab');
    await expect(card('+4')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(card('1')).toBeFocused();
    await audit(page);
});

test('keeps the cards that Bust turns off in the grid, one stop as before, and pressing one does nothing', async ({
    page,
}) => {
    await open(page);
    const card = (name: string) => page.getByRole('button', { name, exact: true });
    await card('Bust').click();
    await card('Bust').focus();
    await page.keyboard.press('Tab');
    await expect(card('0')).toBeFocused();
    await expect(card('0')).toHaveAttribute('aria-disabled', 'true');
    await page.keyboard.press('ArrowRight');
    await expect(card('1')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(card('1')).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Tab');
    await expect(card('+2')).toBeFocused();
});
