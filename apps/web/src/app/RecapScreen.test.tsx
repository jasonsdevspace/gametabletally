import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import type { SavedGame, SavedPlayer } from '../store/format.js';
import { openStore } from '../store/store.js';
import { AppFrame } from './AppFrame.js';
import { againOf, RecapScreen, winnerWords } from './RecapScreen.js';
import { appLine, fireEvent, render, screen, waitFor, within } from './render.testing.js';
import { heard } from './status.testing.js';

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
const draw = async (game: SavedGame, removed: readonly string[] = []) => {
    window.history.replaceState(null, '', '/recap/?id=g-1');
    const factory = new IDBFactory();
    const store = await openStore(factory);
    for (const one of [player('ann', 'Ann'), player('ben', 'Ben'), player('cat', 'Cat')])
        await store.savePlayer({ ...one, removed: removed.includes(one.id) });
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
        expect(winnerWords([], 0)).toBe('The game is over, and the rules name no winner.');
    });
});

describe('a game played again', () => {
    it('seats the players this phone still holds, in their seats, and keeps the options under the same rules', () => {
        const game = { ...saved([]), options: { pace: 'quick' } };
        expect(againOf(game, new Set(['ann', 'cat']), 'g-2')).toEqual({
            id: 'g-2',
            game: 'flip-7',
            rules: 1,
            options: { pace: 'quick' },
            players: ['ann', 'cat'],
        });
    });

    it("leaves the options to the rules' own where the rules are newer than the game's", () => {
        const game = { ...saved([]), rules: 0, options: { pace: 'quick' } };
        expect(againOf(game, new Set(['ann', 'ben', 'cat']), 'g-2')).toMatchObject({
            rules: 1,
            options: {},
        });
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

    it('opens a new game to seat others where too few of its players are still on this phone', async () => {
        await draw(won, ['ben']);
        await screen.findByText('Ann wins with 229.');
        fireEvent.click(
            await screen.findByRole('button', { name: 'Play again with the same players' })
        );
        await waitFor(() => {
            expect(window.location.pathname + window.location.search).toBe('/new/?game=flip-7');
        });
    });

    it('deletes a finished game at once and gives way to the history in its place', async () => {
        const { open } = await draw(won);
        await screen.findByText('Ann wins with 229.');
        const before = window.history.length;
        fireEvent.click(screen.getByRole('button', { name: 'Delete this game' }));
        await waitFor(() => {
            expect(window.location.pathname + window.location.search).toBe('/history/');
        });
        expect(window.history.length).toBe(before);
        const store = await open();
        const gone = await store.game('g-1');
        store.close();
        expect(gone).toBeNull();
    });

    it('says the deleted game by its date, and says it is back once Undo puts it back', async () => {
        const { open } = await draw(won);
        await screen.findByText('Ann wins with 229.');
        fireEvent.click(screen.getByRole('button', { name: 'Delete this game' }));
        const toast = () => document.querySelector('.dk-app-toast [role="status"]');
        await waitFor(() => {
            expect(toast()?.textContent).toContain(
                'The game of Flip 7 from November 14, 2026 is deleted.'
            );
        });
        fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
        await heard(appLine(), 'The game of Flip 7 from November 14, 2026 is back.');
        const store = await open();
        expect(await store.game('g-1')).not.toBeNull();
        store.close();
    });

    it('lets Play again go while a delete is under way', async () => {
        const { open } = await draw(won);
        await screen.findByText('Ann wins with 229.');
        fireEvent.click(screen.getByRole('button', { name: 'Delete this game' }));
        fireEvent.click(screen.getByRole('button', { name: 'Play again with the same players' }));
        await waitFor(() => {
            expect(window.location.pathname).toBe('/history/');
        });
        const store = await open();
        expect(await store.game('g-2')).toBeNull();
        store.close();
    });

    it('lets Delete go while Play again is under way', async () => {
        const { open } = await draw(won);
        await screen.findByText('Ann wins with 229.');
        fireEvent.click(screen.getByRole('button', { name: 'Play again with the same players' }));
        fireEvent.click(screen.getByRole('button', { name: 'Delete this game' }));
        await waitFor(() => {
            expect(window.location.pathname + window.location.search).toBe('/game/?id=g-2');
        });
        const store = await open();
        expect(await store.game('g-1')).not.toBeNull();
        store.close();
    });

    it('says a round is being changed, with no winner and no Play again, while one is open', async () => {
        await draw({
            ...won,
            draft: {
                index: 1,
                round: { entries: { ann: hand([2]), ben: hand([4]), cat: hand([1]) }, out: [] },
                step: { part: 'entry', player: 'ann' },
            },
        });
        expect(
            await screen.findByText(/Round 2 of this game of Flip 7 is being changed\./)
        ).toBeTruthy();
        expect(screen.getByRole('link', { name: 'Go back to round 2' }).getAttribute('href')).toBe(
            '/game/?id=g-1&round=2&from=recap'
        );
        expect(screen.queryByRole('button', { name: /Play again/ })).toBeNull();
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
        expect(screen.queryByRole('button', { name: 'Delete this game' })).toBeNull();
    });
});
