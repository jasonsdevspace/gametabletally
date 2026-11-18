import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import type { SavedGame, SavedPlayer } from '../store/format.js';
import { openStore } from '../store/store.js';
import { AppFrame } from './AppFrame.js';
import { RecapScreen, winnerWords } from './RecapScreen.js';

/* The recap of a game in the app's frame, over a database in memory, and the words it draws. */

const player = (id: string, name: string): SavedPlayer => ({
    id,
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const hand = (numbers: number[], modifiers: string[] = []) => ({ numbers, modifiers, bust: false });
const SEVEN = [12, 11, 10, 9, 8, 7, 6];

const saved = (rounds: unknown[], draft: SavedGame['draft'] = null): SavedGame => ({
    id: 'g-1',
    game: 'flip-7',
    rules: 1,
    options: {},
    players: ['ann', 'ben', 'cat'],
    rounds,
    draft,
    started: '2026-11-14T10:00:00Z',
    changed: '2026-11-14T10:00:00Z',
});

/** The recap at the game's address, over a database holding the game and its players. */
const draw = async (game: SavedGame) => {
    window.history.replaceState(null, '', '/recap/?id=g-1');
    const factory = new IDBFactory();
    const store = await openStore(factory);
    for (const one of [player('ann', 'Ann'), player('ben', 'Ben'), player('cat', 'Cat')])
        await store.savePlayer(one);
    await store.saveGame(game);
    store.close();
    render(
        <AppFrame screen="recap" title="Recap">
            <RecapScreen open={() => openStore(factory)} newId={() => 'g-2'} />
        </AppFrame>
    );
    return { open: () => openStore(factory) };
};

describe('the winner in words', () => {
    it('names one winner with their total, and winners who share it as sharing it', () => {
        expect(winnerWords(['Ann'], 205)).toBe('Ann wins with 205.');
        expect(winnerWords(['Ann', 'Ben'], 210)).toBe('Ann and Ben share the win, level on 210.');
    });
});

describe('the recap', () => {
    const won = saved([
        { entries: { ann: hand(SEVEN, ['x2', '+10']), ben: hand([3]), cat: hand([1]) } },
        { entries: { ann: hand(SEVEN), ben: hand([4]), cat: hand([1]) } },
    ]);

    it('names the winner, with the final standings and every round', async () => {
        await draw(won);
        expect(await screen.findByText('Ann wins with 229.')).toBeTruthy();
        expect(
            within(screen.getByRole('list', { name: 'Standings' }))
                .getAllByRole('listitem')
                .map((row) => row.textContent)
        ).toEqual([
            'Ann, 1st place, 229 points',
            'Ben, 2nd place, 7 points',
            'Cat, 3rd place, 2 points',
        ]);
        expect(screen.getByRole('table', { name: 'Scores by round, newest first' })).toBeTruthy();
        // The winner is named once, by the recap, not again by the standings.
        expect(screen.queryByText('Ann won with 229.')).toBeNull();
    });

    it('plays again with the same players in the same seats, at the first round of a new game', async () => {
        const { open } = await draw(won);
        await screen.findByText('Ann wins with 229.');
        fireEvent.click(
            await screen.findByRole('button', { name: 'Play again with the same players' })
        );
        await waitFor(() => {
            expect(window.location.pathname + window.location.search).toBe('/game/?id=g-2');
        });
        const store = await open();
        const fresh = await store.game('g-2');
        store.close();
        expect(fresh).toMatchObject({
            game: 'flip-7',
            players: ['ann', 'ben', 'cat'],
            rounds: [],
            draft: { index: 0, step: { part: 'entry', player: 'ann' } },
        });
    });

    it('says a game is in play, with no winner, where a changed round has put it back', async () => {
        await draw(
            saved([{ entries: { ann: hand([3]), ben: hand([4]), cat: hand([5]) } }], {
                index: 1,
                round: { entries: {}, out: [] },
                step: { part: 'entry', player: 'ann' },
            })
        );
        expect(
            await screen.findByText(/This game of Flip 7 is in play, so it has no winner yet\./)
        ).toBeTruthy();
        expect(screen.queryByRole('button', { name: /Play again/ })).toBeNull();
    });
});
