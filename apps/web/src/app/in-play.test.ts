import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { type GameInPlay, openPlay } from '../play/play.js';
import { openStore } from '../store/store.js';
import { continuingOf, readContinuing, turnOf } from './in-play.js';

/*
 * The game the start screen offers to continue, worked out from games the app's own model
 * started and played, over a database in memory.
 */

const hand = (numbers: readonly number[]) => ({ numbers, modifiers: [], bust: false });

/** A clock that moves on a second at each reading, so the game changed last is the last played. */
const clock = () => {
    let at = Date.parse('2026-11-15T10:00:00Z');
    return () => {
        at += 1000;
        return new Date(at).toISOString();
    };
};

const setUp = async () => {
    const factory = new IDBFactory();
    const store = await openStore(factory, 'start');
    await store.savePlayer({
        id: 'ann',
        name: 'Ann',
        added: '2026-11-01T10:00:00Z',
        removed: false,
    });
    await store.savePlayer({
        id: 'ben',
        name: 'Ben',
        added: '2026-11-01T10:01:00Z',
        removed: false,
    });
    const play = openPlay(store, clock(), () => Promise.resolve());
    return { factory, store, play };
};

const NAMES = new Map([
    ['ann', 'Ann'],
    ['ben', 'Ben'],
]);

const only = (games: readonly GameInPlay[]): GameInPlay => {
    const [game] = games;
    if (!game) throw new Error('no game');
    return game;
};

describe('the game the start screen offers to continue', () => {
    it("says whose turn it is, by the player's name", async () => {
        const { play } = await setUp();
        await play.start({
            id: 'g-1',
            game: 'flip-7',
            rules: 1,
            options: {},
            players: ['ann', 'ben'],
        });
        expect(turnOf(only(play.snapshot().games), NAMES)).toBe("It is Ann's turn.");
        await play.enter('g-1', hand([5]));
        expect(turnOf(only(play.snapshot().games), NAMES)).toBe("It is Ben's turn.");
    });

    it('says a round entered whole is ready to save, and a player it cannot name is the next one', async () => {
        const { play } = await setUp();
        await play.start({
            id: 'g-1',
            game: 'flip-7',
            rules: 1,
            options: {},
            players: ['ann', 'ben'],
        });
        expect(turnOf(only(play.snapshot().games), new Map())).toBe(
            "It is the next player's turn."
        );
        await play.enter('g-1', hand([5]));
        await play.enter('g-1', hand([6]));
        expect(turnOf(only(play.snapshot().games), NAMES)).toBe(
            'The round is entered and ready to save.'
        );
    });

    it('says a Skyjo round waits on who ended it, once every card count is in', async () => {
        const { play } = await setUp();
        await play.start({
            id: 'g-1',
            game: 'skyjo',
            rules: 1,
            options: {},
            players: ['ann', 'ben'],
        });
        await play.enter('g-1', { total: 10 });
        await play.enter('g-1', { total: 12 });
        expect(turnOf(only(play.snapshot().games), NAMES)).toBe('Next, say who ended the round.');
    });

    it('offers the game in play changed last, by name and round, and none when there is none', async () => {
        const { play } = await setUp();
        expect(continuingOf(play.snapshot().games, NAMES)).toBeNull();
        await play.start({
            id: 'g-old',
            game: 'wizard',
            rules: 1,
            options: {},
            players: ['ann', 'ben', 'cat'],
        });
        await play.start({
            id: 'g-new',
            game: 'flip-7',
            rules: 1,
            options: {},
            players: ['ann', 'ben', 'cat'],
        });
        await play.enter('g-new', hand([5]));
        await play.enter('g-new', hand([6]));
        await play.enter('g-new', hand([7]));
        await play.saveRound('g-new');
        expect(continuingOf(play.snapshot().games, NAMES)).toEqual({
            id: 'g-new',
            name: 'Flip 7',
            round: 2,
            turn: "It is Ann's turn.",
        });
    });

    it('reads the game from the database and lets it go, asking the browser for nothing', async () => {
        const { factory, play, store } = await setUp();
        await play.start({
            id: 'g-1',
            game: 'flip-7',
            rules: 1,
            options: {},
            players: ['ann', 'ben'],
        });
        store.close();
        let closed = 0;
        const found = await readContinuing(async () => {
            const opened = await openStore(factory, 'start');
            return {
                ...opened,
                close: () => {
                    closed += 1;
                    opened.close();
                },
            };
        });
        expect(found).toMatchObject({ id: 'g-1', turn: "It is Ann's turn." });
        expect(closed).toBe(1);
    });
});
