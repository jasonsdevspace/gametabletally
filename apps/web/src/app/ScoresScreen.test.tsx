import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import type { SavedGame, SavedPlayer } from '../store/format.js';
import { openStore } from '../store/store.js';
import { AppFrame } from './AppFrame.js';
import { render, screen, waitFor, within } from './render.testing.js';
import { leadWords, placeWords, ScoresScreen, standingsOf } from './ScoresScreen.js';

/* The scores of a game in play in the app's frame, over a database in memory, and their words. */

const player = (id: string, name: string): SavedPlayer => ({
    id,
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const hand = (numbers: number[]) => ({ numbers, modifiers: [], bust: false });

const saved = (game: string, rounds: unknown[], draft: SavedGame['draft'] = null): SavedGame => ({
    id: 'g-1',
    game,
    rules: 1,
    options: {},
    players: ['ann', 'ben', 'cat'],
    rounds,
    draft,
    started: '2026-11-14T10:00:00Z',
    changed: '2026-11-14T10:00:00Z',
});

/** The screen at the game's address, over a database holding the game and its players. */
const draw = async (game: SavedGame, search = '?id=g-1') => {
    window.history.replaceState(null, '', `/scores/${search}`);
    const factory = new IDBFactory();
    const store = await openStore(factory);
    for (const one of [player('ann', 'Ann'), player('ben', 'Ben'), player('cat', 'Cat')])
        await store.savePlayer(one);
    await store.saveGame(game);
    store.close();
    render(
        <AppFrame screen="scores" title="Scores">
            <ScoresScreen open={() => openStore(factory)} />
        </AppFrame>
    );
    return screen.findByRole('list', { name: 'Standings' });
};

/** Each standing's words, as its row says them, in order. */
const standingsSaid = async (game: SavedGame) =>
    within(await draw(game))
        .getAllByRole('listitem')
        .map((row) => row.textContent);

describe('the standings in words', () => {
    it('ranks the highest total first, with players level sharing a place and the next counted past them', () => {
        expect(
            standingsOf(
                ['ann', 'ben', 'cat', 'dan'],
                { ann: 10, ben: 30, cat: 10, dan: 5 },
                'highest'
            )
        ).toEqual([
            { player: 'ben', total: 30, place: 1, shared: false, missed: false },
            { player: 'ann', total: 10, place: 2, shared: true, missed: false },
            { player: 'cat', total: 10, place: 2, shared: true, missed: false },
            { player: 'dan', total: 5, place: 4, shared: false, missed: false },
        ]);
    });

    it('ranks the lowest total first where the lowest leads', () => {
        expect(
            standingsOf(['ann', 'ben'], { ann: 40, ben: -12 }, 'lowest').map(({ player }) => player)
        ).toEqual(['ben', 'ann']);
    });

    it('ranks a player who missed a scored round behind those who did not, as the rules do', () => {
        expect(
            standingsOf(['ann', 'ben', 'cat'], { ann: 90, ben: 40, cat: 30 }, 'highest', ['ann'])
        ).toEqual([
            { player: 'ben', total: 40, place: 1, shared: false, missed: false },
            { player: 'cat', total: 30, place: 2, shared: false, missed: false },
            { player: 'ann', total: 90, place: 3, shared: false, missed: true },
        ]);
        // Where every player has missed one, none is held behind another for it.
        expect(
            standingsOf(['ann', 'ben'], { ann: 90, ben: 40 }, 'highest', ['ann', 'ben']).map(
                ({ player, missed }) => [player, missed]
            )
        ).toEqual([
            ['ann', false],
            ['ben', false],
        ]);
    });

    it('says a place as a number with its ending', () => {
        expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(placeWords)).toEqual([
            '1st',
            '2nd',
            '3rd',
            '4th',
            '11th',
            '12th',
            '13th',
            '21st',
            '22nd',
            '103rd',
        ]);
    });

    it('says who leads, alone or level, and the lowest where it leads', () => {
        const words = { total: 30, ahead: 'highest', counted: true } as const;
        expect(leadWords({ ...words, leaders: ['Ben'] })).toBe('Ben leads with 30.');
        expect(leadWords({ ...words, leaders: ['Ann', 'Ben', 'Cat'] })).toBe(
            'Ann, Ben and Cat lead, level on 30.'
        );
        expect(leadWords({ ...words, ahead: 'lowest', leaders: ['Ann'] })).toBe(
            'Ann leads with 30, the lowest total.'
        );
        expect(leadWords({ ...words, counted: false, leaders: ['Ann'] })).toBe(
            'No round is counted yet.'
        );
        expect(leadWords({ ...words, over: true, leaders: ['Ann'] })).toBe('Ann won with 30.');
        expect(leadWords({ ...words, over: true, leaders: ['Ann', 'Ben'] })).toBe(
            'Ann and Ben won together, level on 30.'
        );
    });
});

describe('the scores screen', () => {
    it('lists the standings of a game the highest total leads, highest first, and says who leads', async () => {
        const said = await standingsSaid(
            saved('flip-7', [
                { entries: { ann: hand([3, 7]), ben: hand([12]), cat: hand([10]) } },
                { entries: { ann: hand([2]), ben: hand([1]), cat: hand([5]) } },
            ])
        );
        expect(said).toEqual([
            'Cat, 1st place, 15 points',
            'Ben, 2nd place, 13 points',
            'Ann, 3rd place, 12 points',
        ]);
        expect(screen.getByText('Cat leads with 15.')).toBeTruthy();
    });

    it('lists the standings of a game the lowest total leads, lowest first, and says who leads', async () => {
        const said = await standingsSaid(
            saved('skyjo', [
                {
                    entries: { ann: { total: -12 }, ben: { total: 40 }, cat: { total: 30 } },
                    ender: 'ann',
                },
            ])
        );
        expect(said).toEqual([
            'Ann, 1st place, -12 points',
            'Cat, 2nd place, 30 points',
            'Ben, 3rd place, 40 points',
        ]);
        expect(screen.getByText('Ann leads with -12, the lowest total.')).toBeTruthy();
    });

    it('gives no one a place before a round is counted, in seat order', async () => {
        const said = await standingsSaid(
            saved('flip-7', [], {
                index: 0,
                round: { entries: {}, out: [] },
                step: { part: 'entry', player: 'ann' },
            })
        );
        expect(said).toEqual(['Ann, 0 points', 'Ben, 0 points', 'Cat, 0 points']);
        expect(screen.getByText('No round is counted yet.')).toBeTruthy();
    });

    it('says one point as one, and says who won once the game is over', async () => {
        const said = await standingsSaid(
            saved('flip-7', [
                {
                    entries: {
                        ann: hand([1]),
                        ben: hand([12, 11, 10, 9, 8, 7, 6]),
                        cat: hand([0]),
                    },
                },
                {
                    entries: {
                        ann: hand([0]),
                        ben: {
                            numbers: [12, 11, 10, 9, 8, 7, 5],
                            modifiers: ['x2', '+10'],
                            bust: false,
                        },
                        cat: hand([0]),
                    },
                },
            ])
        );
        expect(said).toEqual([
            'Ben, 1st place, 227 points',
            'Ann, 2nd place, 1 point',
            'Cat, 3rd place, 0 points',
        ]);
        expect(screen.getByText('Ben won with 227.')).toBeTruthy();
    });

    it('says a game this phone does not hold may have been deleted, with a way to the history', async () => {
        window.history.replaceState(null, '', '/scores/?id=gone');
        const factory = new IDBFactory();
        render(
            <AppFrame screen="scores" title="Scores">
                <ScoresScreen open={() => openStore(factory)} />
            </AppFrame>
        );
        expect(
            await screen.findByText('This game is not on this phone. It may have been deleted.')
        ).toBeVisible();
        expect(screen.getByRole('link', { name: 'Go to the history' })).toHaveAttribute(
            'href',
            '/history/'
        );
    });

    it('keeps the round arrived back at in the Tab order', async () => {
        await draw(
            saved('flip-7', [{ entries: { ann: hand([3]), ben: hand([4]), cat: hand([5]) } }], {
                index: 1,
                round: { entries: {}, out: [] },
                step: { part: 'entry', player: 'ann' },
            }),
            '?id=g-1&round=1'
        );
        const round = await waitFor(() => {
            const found = document.getElementById('round-1');
            if (found === null) throw new Error('Round 1 has no heading to change it by.');
            return found;
        });
        expect(round).not.toHaveAttribute('tabindex', '-1');
        expect(round.tabIndex).toBe(0);
    });

    it('marks a round still being entered as not yet counted, with what stands so far', async () => {
        await draw(
            saved('flip-7', [{ entries: { ann: hand([3]), ben: hand([4]), cat: hand([5]) } }], {
                index: 1,
                round: { entries: { ann: hand([9]) }, out: [] },
                step: { part: 'entry', player: 'ben' },
            })
        );
        const heads = within(screen.getByRole('table', { name: 'Scores by round, newest first' }))
            .getAllByRole('columnheader')
            .map((head) => head.textContent);
        expect(heads).toEqual(['Player and total', 'Round 2 not yet counted', 'Change Round 1']);
        const ann = screen.getByRole('rowheader', { name: /^Ann/ }).closest('tr');
        expect(ann?.textContent).toBe('Ann, 3 in all93');
        const ben = screen.getByRole('rowheader', { name: /^Ben/ }).closest('tr');
        expect(ben?.textContent).toBe('Ben, 4 in allNothing yet4');
        expect(screen.getByRole('link', { name: 'Back to round 2' })).toBeTruthy();
    });
});
