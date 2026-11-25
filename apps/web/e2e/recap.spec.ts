import { hrefOf, newGameOf } from '../src/routes.js';
import type { SavedGame, SavedPlayer } from '../src/store/format.js';
import { audit, buildGame, expect, type Page, seed, test } from './support.js';

/*
 * The end of a game, as deployed: the one test that plays a game of Flip 7 through on a phone, from
 * starting it to playing again, with the audit on every screen it reaches, and, from a seeded game,
 * a recap opened by its address after a reload and a changed round that puts the game back in play.
 */

const NAMES = ['Ann', 'Ben', 'Cat'];

const player = (name: string): SavedPlayer => ({
    id: name.toLowerCase(),
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const key = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const dock = (page: Page) => page.getByRole('region', { name: 'Actions' });
const bar = (page: Page) => page.locator('#screen-title');

/** Taps a hand in for the player whose turn it is, card by card. */
const tap = async (page: Page, cards: readonly string[]) => {
    for (const card of cards) await key(page, card).click();
};

const SEVEN = ['12', '11', '10', '9', '8', '7', '6'];

test('plays a game of Flip 7 through, from its start to its recap and playing again', async ({
    page,
}, info) => {
    test.skip(info.project.name !== 'phone', 'A game is played on a phone.');
    await page.goto('/');
    await seed(page, [], NAMES.map(player));
    await page.goto(hrefOf('play'));
    await page.locator('a[data-game="flip-7"]').click();
    await expect(page).toHaveURL(newGameOf('flip-7'));
    for (const name of NAMES) await page.getByRole('button', { name: `Add ${name}` }).click();
    await audit(page);
    await page.getByRole('button', { name: 'Start the game' }).click();
    await expect(page.locator('.gtt-score-name')).toHaveText('Ann');

    // The first round: Ann holds seven numbers, doubled, with ten more.
    await tap(page, [...SEVEN, 'Times 2', '+10']);
    await audit(page);
    await dock(page).getByRole('button', { name: 'Next: Ben' }).click();
    await tap(page, ['3']);
    await dock(page).getByRole('button', { name: 'Next: Cat' }).click();
    await tap(page, ['1']);
    await dock(page).getByRole('button', { name: 'Save the round' }).click();
    await expect(page.locator('.gtt-score-name')).toHaveText('Ann');

    // The scores between rounds.
    await dock(page).getByRole('link', { name: 'Scores' }).click();
    await expect(page.getByText('Ann leads with 151.')).toBeVisible();
    await audit(page);
    await dock(page).getByRole('link', { name: 'Back to round 2' }).click();

    // The second round takes Ann past two hundred, which ends the game and opens its recap.
    await tap(page, SEVEN);
    await dock(page).getByRole('button', { name: 'Next: Ben' }).click();
    await tap(page, ['4']);
    await dock(page).getByRole('button', { name: 'Next: Cat' }).click();
    await tap(page, ['1']);
    await dock(page).getByRole('button', { name: 'Save the round' }).click();
    await expect(page).toHaveURL(/\/recap\/\?id=/);
    await expect(bar(page)).toHaveText('Recap');
    await expect(page.getByText('Ann wins with 229.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Standings' }).getByRole('listitem')).toHaveText([
        'Ann, 1st place, 229 points',
        'Ben, 2nd place, 7 points',
        'Cat, 3rd place, 2 points',
    ]);
    await audit(page);

    // Play again: a new game of Flip 7, the same players in the same seats, at its first round.
    await dock(page).getByRole('button', { name: 'Play again with the same players' }).click();
    await expect(page).toHaveURL(/\/game\/\?id=/);
    await expect(bar(page)).toHaveText('Game in play');
    await expect(page.locator('.gtt-score-name')).toHaveText('Ann');
    await expect(page.locator('.gtt-score-line')).toHaveText('0 this round.');
    await dock(page).getByRole('link', { name: 'Scores' }).click();
    await expect(page.getByRole('list', { name: 'Standings' }).getByRole('listitem')).toHaveText([
        'Ann, 0 points',
        'Ben, 0 points',
        'Cat, 0 points',
    ]);
    await audit(page);
});

const hand = (numbers: number[], modifiers: string[] = []) => ({ numbers, modifiers, bust: false });
const SEVEN_CARDS = [12, 11, 10, 9, 8, 7, 6];

/** A game of Flip 7 that Ann has won in its second round. */
const won = (): Promise<SavedGame> =>
    buildGame(
        { id: 'g-1', game: 'flip-7', rules: 1, options: {}, players: ['ann', 'ben', 'cat'] },
        async (model) => {
            for (const round of [
                [hand(SEVEN_CARDS, ['x2', '+10']), hand([3]), hand([1])],
                [hand(SEVEN_CARDS), hand([4]), hand([1])],
            ]) {
                for (const one of round) await model.enter('g-1', one);
                await model.saveRound('g-1');
            }
        }
    );

const openRecap = async (page: Page) => {
    await page.goto('/');
    await seed(page, [await won()], NAMES.map(player));
    await page.goto(hrefOf('recap', 'g-1'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByText('Ann wins with 229.')).toBeVisible();
};

test('shows the same recap when it is opened by its address again after a reload', async ({
    page,
}) => {
    await openRecap(page);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByText('Ann wins with 229.')).toBeVisible();
    await expect(page.getByRole('table', { name: 'Scores by round, newest first' })).toBeVisible();
});

test('puts the game back in play when an earlier round is changed so the rules no longer end it', async ({
    page,
}) => {
    await openRecap(page);
    await page.getByRole('button', { name: 'Change Round 2' }).click();
    await expect(bar(page)).toHaveText('Changing round 2');
    await key(page, 'Bust').click();
    await dock(page).getByRole('button', { name: 'Next: Ben' }).click();
    await dock(page).getByRole('button', { name: 'Next: Cat' }).click();
    await dock(page).getByRole('button', { name: 'Save round 2' }).click();
    // Back on the recap the round was opened from, with focus on its heading.
    await expect(page).toHaveURL(/\/recap\/\?id=g-1&round=2$/);
    await expect(page.getByRole('button', { name: 'Change Round 2' })).toBeFocused();
    await expect(
        page.getByText('This game of Flip 7 is in play, so it has no winner yet.', { exact: false })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Play again/ })).toHaveCount(0);
});

test("moves the winner's words into place within the kit's durations, and not at all for a reader who asks for less motion", async ({
    page,
}) => {
    // The tests ask for less motion unless they are of motion, as this one is.
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await openRecap(page);
    const winner = page.getByText('Ann wins with 229.');
    const motion = () =>
        winner.evaluate((element) => {
            const { animationName, animationDuration } = getComputedStyle(element);
            const medium = getComputedStyle(document.documentElement).getPropertyValue(
                '--dk-duration-medium'
            );
            return { animationName, animationDuration, medium: medium.trim() };
        });
    const moving = await motion();
    expect(moving.animationName).not.toBe('none');
    // A duration in milliseconds, whichever unit it is written in.
    const ms = (duration: string) =>
        Number.parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000);
    expect(ms(moving.animationDuration)).toBeLessThanOrEqual(ms(moving.medium));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.reload();
    await expect(winner).toBeVisible();
    expect((await motion()).animationName).toBe('none');
});
