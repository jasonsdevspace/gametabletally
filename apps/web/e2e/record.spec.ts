import { THEME_KEY } from '@jasonsdevspace/design-kit/theme';

import { hrefOf } from '../src/routes.js';
import type { SavedGame, SavedPlayer } from '../src/store/format.js';
import { audit, expect, type Page, seed, smallTargets, test } from './support.js';

/*
 * A player's record on their page, as deployed: a row for each game they have finished, worked out
 * from the saved games with a game in play left out, the words that stand in for it while they have
 * finished none, and the axe audit and the target size check on both in each theme.
 */

const player = (name: string): SavedPlayer => ({
    id: name.toLowerCase(),
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const hand = (numbers: number[], modifiers: string[] = []) => ({ numbers, modifiers, bust: false });
const SEVEN = [12, 11, 10, 9, 8, 7, 6];

/** A game as the store saves it, with no round being entered. */
const saved = (id: string, game: string, players: string[], rounds: unknown[]): SavedGame => ({
    id,
    game,
    rules: 1,
    options: {},
    players,
    rounds,
    draft: null,
    started: '2026-11-20T19:00:00Z',
    changed: '2026-11-20T21:00:00Z',
});

/** Flip 7 for Ann, Ben and Cat, which the seat given wins on 229, the others ending on 3. */
const flip7 = (id: string, winner: string) =>
    saved(
        id,
        'flip-7',
        ['ann', 'ben', 'cat'],
        [0, 1].map((at) => ({
            entries: Object.fromEntries(
                ['ann', 'ben', 'cat'].map((one) => [
                    one,
                    one === winner
                        ? at === 0
                            ? hand(SEVEN, ['x2', '+10'])
                            : hand(SEVEN)
                        : hand([at + 1]),
                ])
            ),
        }))
    );

const GAMES: SavedGame[] = [
    // Ann wins one on 229 and ends the other on 3.
    flip7('f-1', 'ann'),
    flip7('f-2', 'ben'),
    // Ann ends on 32 and Ben on 103, so Ann wins with the lowest total.
    saved(
        's-1',
        'skyjo',
        ['ann', 'ben'],
        [
            { entries: { ann: { total: 20 }, ben: { total: 55 } }, ender: 'ann' },
            { entries: { ann: { total: 12 }, ben: { total: 48 } }, ender: 'ann' },
        ]
    ),
    // In play, with a round being entered, so it counts in nothing.
    {
        ...saved(
            'f-3',
            'flip-7',
            ['ann', 'ben', 'cat'],
            [{ entries: { ann: hand([12]), ben: hand([1]), cat: hand([2]) } }]
        ),
        draft: { index: 1, round: { entries: {} }, step: { part: 'entry', player: 'ann' } },
    },
];

const PLAYERS = ['Ann', 'Ben', 'Cat', 'Dee'].map(player);

const opened = async (page: Page, id: string, name: string) => {
    await page.goto('/');
    await seed(page, GAMES, PLAYERS);
    await page.goto(hrefOf('player', id));
    await expect(page.getByRole('heading', { name })).toBeVisible();
};

const record = (page: Page) => page.getByRole('table', { name: 'Record' });

test("shows a player's record for each game they have finished, with a game in play left out", async ({
    page,
}) => {
    await opened(page, 'ann', 'Ann');
    await expect(record(page).getByRole('columnheader')).toHaveText([
        'Game',
        'Played',
        'Won',
        'Best',
        'Average',
    ]);
    const rows = record(page).locator('tbody tr');
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0).locator('th, td')).toHaveText(['Flip 7', '2', '1', '229', '116']);
    await expect(rows.nth(1).locator('th, td')).toHaveText(['Skyjo', '1', '1', '32', '32']);
    await expect(
        page.getByText('In Skyjo the lowest total wins, so the best there is the lowest.')
    ).toBeVisible();
});

test('says what will appear there for a player who has finished no game', async ({ page }) => {
    await opened(page, 'dee', 'Dee');
    await expect(record(page)).toHaveCount(0);
    await expect(page.getByText(/^No finished games yet\./)).toBeVisible();
    await expect(page.getByRole('link', { name: 'Start a game' })).toBeVisible();
});

for (const theme of ['light', 'dark'] as const)
    test(`passes the axe audit and the target size check with a record and without, in the ${theme} theme`, async ({
        page,
    }) => {
        await page.addInitScript(
            ([key, value]) => {
                localStorage.setItem(key, value);
            },
            [THEME_KEY, theme] as const
        );
        await opened(page, 'ann', 'Ann');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await expect(record(page)).toBeVisible();
        await audit(page);
        expect(await smallTargets(page)).toEqual([]);
        await page.goto(hrefOf('player', 'dee'));
        await expect(page.getByText(/^No finished games yet\./)).toBeVisible();
        await audit(page);
        expect(await smallTargets(page)).toEqual([]);
    });
