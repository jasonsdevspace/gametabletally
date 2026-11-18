import type { Problem } from '@gametabletally/scoring';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import type { SavedGame, SavedPlayer } from '../store/format.js';
import { openStore } from '../store/store.js';
import { AppFrame } from './AppFrame.js';
import { GameScreen, handOf, lineOf, refusalWords } from './GameScreen.js';
import { heard } from './status.testing.js';

/* The game in play in the app's frame, over a database in memory, and the words it draws. */

const player = (id: string, name: string): SavedPlayer => ({
    id,
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const flip7 = (draft: SavedGame['draft'] = null): SavedGame => ({
    id: 'g-1',
    game: 'flip-7',
    rules: 1,
    options: {},
    players: ['ann', 'ben', 'cat'],
    rounds: [],
    draft,
    started: '2026-11-14T10:00:00Z',
    changed: '2026-11-14T10:00:00Z',
});

const AT_ANN: SavedGame['draft'] = {
    index: 0,
    round: { entries: {}, out: [] },
    step: { part: 'entry', player: 'ann' },
};

/** The screen at a game's address, over a database holding the game and its players. */
const draw = async (saved: SavedGame | null = flip7(AT_ANN), id = 'g-1') => {
    window.history.replaceState(null, '', `/game/?id=${id}`);
    const factory = new IDBFactory();
    const store = await openStore(factory);
    for (const one of [player('ann', 'Ann'), player('ben', 'Ben'), player('cat', 'Cat')])
        await store.savePlayer(one);
    if (saved !== null) await store.saveGame(saved);
    store.close();
    render(
        <AppFrame screen="game" title="Game in play">
            <GameScreen
                open={() => openStore(factory)}
                now={() => new Date('2026-11-15T09:00:00Z')}
            />
        </AppFrame>
    );
    // The screen reads the database once it is running, so the keys come once it has.
    if (saved?.draft) await screen.findByRole('button', { name: 'Bust' });
    return { open: () => openStore(factory) };
};

const press = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name }));
};

const digits = () => document.querySelector('.gtt-digits');

/** The score header's status line, and the screen's own, each saying what changed. */
const headerLine = () => document.querySelector<HTMLElement>('.gtt-score [role="status"]');
const screenLine = () => document.querySelector<HTMLElement>('.gtt-game > [role="status"]');

/**
 * Waits for a line to say its words. The kit's line puts them in a moment after it is told, so a
 * test waits for them before it ends, or the moment would come after the page is gone.
 */
const said = async (line: HTMLElement | null, words: string) => {
    if (line === null) throw new Error('The status line is not on the page.');
    await heard(line, words);
};

describe('the words the game screen draws', () => {
    it('words a hand of too many numbers from its code and data', () => {
        const problem: Problem = {
            code: 'too-many-numbers',
            message: 'The round ends at 7 different numbers.',
            data: { max: 7, given: 8 },
            round: 0,
            player: 'ann',
        };
        expect(refusalWords(problem)).toBe(
            'A round ends at 7 numbers, so a hand holds no more. Take one off.'
        );
    });

    it("words a code the keys cannot meet by the package's own sentence", () => {
        const problem: Problem = {
            code: 'unknown-player',
            message: 'The round names a player who is not in the game.',
            data: {},
            round: 0,
            player: null,
        };
        expect(refusalWords(problem)).toBe(problem.message);
    });

    it('says how a total adds up, in the first round and after it, with a bust and the bonus', () => {
        const hand = { numbers: [3, 7], modifiers: [], bust: false } as const;
        expect(lineOf({ before: 0, round: 10, first: true, hand })).toBe('10 this round.');
        expect(lineOf({ before: 42, round: 10, first: false, hand })).toBe(
            '42 before this round, and 10 this round.'
        );
        expect(lineOf({ before: 42, round: 0, first: false, hand: { ...hand, bust: true } })).toBe(
            '42 before this round, and bust this round, so nothing.'
        );
        expect(
            lineOf({
                before: 0,
                round: 36,
                first: true,
                hand: { ...hand, numbers: [0, 1, 2, 3, 4, 5, 6] },
            })
        ).toBe('36 this round, with 15 for 7 numbers.');
    });

    it('reads a hand as the round holds it, and an empty one from anything else', () => {
        expect(handOf({ numbers: [3, 'x'], modifiers: ['+4', '+3'], bust: false })).toEqual({
            numbers: [3],
            modifiers: ['+4'],
            bust: false,
        });
        expect(handOf(undefined)).toEqual({ numbers: [], modifiers: [], bust: false });
    });
});

describe('the game screen', () => {
    it('keeps each tap and shows the round as it stands in the header', async () => {
        const { open } = await draw();
        press('3');
        press('7');
        press('+4');
        await waitFor(() => {
            expect(digits()).toHaveAccessibleName('14');
        });
        await said(headerLine(), "Ann's total is 14.");
        expect(screen.getByRole('button', { name: '7' })).toHaveAttribute('aria-pressed', 'true');
        const store = await open();
        expect((await store.game('g-1'))?.draft?.round['entries']).toEqual({
            ann: { numbers: [3, 7], modifiers: ['+4'], bust: false },
        });
        store.close();
    });

    it('clears the hand on a bust, says so beside it, and takes it back', async () => {
        await draw();
        press('5');
        press('Bust');
        const bust = screen.getByRole('button', { name: 'Bust' });
        expect(bust).toHaveAttribute('aria-pressed', 'true');
        expect(bust).toHaveAccessibleDescription(
            'Ann bust, so nothing counts this round. Press Bust again to take it back.'
        );
        expect(screen.getByRole('button', { name: '5' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name: '5' })).toHaveAttribute('aria-disabled', 'true');
        await said(headerLine(), "Ann's total is 0.");
        press('Bust');
        expect(bust).toHaveAttribute('aria-pressed', 'false');
    });

    it('says in words beside the keys why a hand is refused, and holds the next player', async () => {
        await draw();
        for (const card of ['0', '1', '2', '3', '4', '5', '6', '7']) press(card);
        const why = 'A round ends at 7 numbers, so a hand holds no more. Take one off.';
        expect(await screen.findByText(why)).toBeVisible();
        await said(screenLine(), why);
        expect(screen.getByRole('group', { name: 'Number cards' })).toHaveAccessibleDescription(
            why
        );
        expect(screen.getByRole('button', { name: 'Next: Ben' })).toHaveAttribute(
            'aria-disabled',
            'true'
        );
    });

    it('names the next player, and moves to them', async () => {
        await draw();
        press('Next: Ben');
        await said(headerLine(), 'Ben is next.');
        expect(document.querySelector('.gtt-score-name')).toHaveTextContent('Ben');
        expect(screen.getByRole('button', { name: 'Next: Cat' })).toBeVisible();
    });

    it('says a game it does not hold', async () => {
        await draw(null);
        expect(await screen.findByText('This game is not on this phone.')).toBeVisible();
    });

    it('says a game that is over', async () => {
        await draw(flip7(null));
        await act(() => Promise.resolve());
        expect(await screen.findByText('This game of Flip 7 is over.')).toBeVisible();
        expect(screen.getByRole('link', { name: 'Scores' }).getAttribute('href')).toBe(
            '/scores/?id=g-1'
        );
    });
});

describe('the game screen as the turn moves on', () => {
    it('ignores a tap made while the hand is entered, so it never lands in the next seat', async () => {
        const { open } = await draw();
        press('3');
        await said(headerLine(), "Ann's total is 3.");
        press('Next: Ben');
        press('9');
        await said(headerLine(), 'Ben is next.');
        const store = await open();
        expect((await store.game('g-1'))?.draft?.round['entries']).toEqual({
            ann: { numbers: [3], modifiers: [], bust: false },
        });
        store.close();
    });

    it('ignores a tap made while Undo puts a hand back, so it never lands in the player it restores', async () => {
        const { open } = await draw();
        press('3');
        await said(headerLine(), "Ann's total is 3.");
        press('Next: Ben');
        await said(headerLine(), 'Ben is next.');
        const undo = await screen.findByRole('button', { name: 'Undo' });
        fireEvent.click(undo);
        press('9');
        await said(headerLine(), 'Ann is next.');
        const store = await open();
        expect((await store.game('g-1'))?.draft?.round['entries']).toEqual({
            ann: { numbers: [3], modifiers: [], bust: false },
        });
        store.close();
    });

    it('counts a reopened round once in the header, as it stands', async () => {
        const saved: SavedGame = {
            ...flip7({
                index: 0,
                round: {
                    entries: {
                        ann: { numbers: [12, 8], modifiers: [], bust: false },
                        ben: { numbers: [], modifiers: [], bust: true },
                        cat: { numbers: [], modifiers: [], bust: true },
                    },
                    out: [],
                },
                step: { part: 'entry', player: 'ann' },
            }),
            rounds: [
                {
                    entries: {
                        ann: { numbers: [12, 8], modifiers: [], bust: false },
                        ben: { numbers: [], modifiers: [], bust: true },
                        cat: { numbers: [], modifiers: [], bust: true },
                    },
                },
            ],
        };
        await draw(saved);
        await waitFor(() => {
            expect(digits()).toHaveAccessibleName('20');
        });
        expect(document.querySelector('.gtt-score-line')).toHaveTextContent('20 this round.');
    });

    it('says the games could not be read when reading them fails', async () => {
        window.history.replaceState(null, '', '/game/?id=g-1');
        const factory = new IDBFactory();
        render(
            <AppFrame screen="game" title="Game in play">
                <GameScreen
                    open={async () => {
                        const store = await openStore(factory);
                        return {
                            ...store,
                            games: () => Promise.reject(new Error('The record is not readable.')),
                        };
                    }}
                />
            </AppFrame>
        );
        expect(await screen.findByRole('alert')).toHaveTextContent(
            'Your saved games could not be read.'
        );
    });
});
