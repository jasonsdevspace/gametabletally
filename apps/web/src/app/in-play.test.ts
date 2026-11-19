import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { type GameInPlay, openPlay } from '../play/play.js';
import { openStore } from '../store/store.js';
import { inPlayOf, turnOf } from './in-play.js';

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
    it("says whose score is next, by the player's name", async () => {
        const { play } = await setUp();
        await play.start({
            id: 'g-1',
            game: 'flip-7',
            rules: 1,
            options: {},
            players: ['ann', 'ben'],
        });
        expect(turnOf(only(play.snapshot().games), NAMES)).toBe("Ann's score is next.");
        await play.enter('g-1', hand([5]));
        expect(turnOf(only(play.snapshot().games), NAMES)).toBe("Ben's score is next.");
    });

    it('says a round entered whole is ready to save, and a player it cannot name is the next one', async () => {
        const { play } = await setUp();
        await play.start({
            id: 'g-1',
            game: 'flip-7',
            rules: 1,
            options: {},
            players: ['ann', 'ben', 'cat'],
        });
        expect(turnOf(only(play.snapshot().games), new Map())).toBe(
            "Another player's score is next."
        );
        await play.enter('g-1', hand([5]));
        await play.enter('g-1', hand([6]));
        await play.enter('g-1', hand([7]));
        expect(turnOf(only(play.snapshot().games), NAMES)).toBe(
            'Every score is in. The round is ready to save.'
        );
    });

    it('says a round the rules refuse needs a check, and a game with no round started has none', async () => {
        const { play } = await setUp();
        await play.start({
            id: 'g-1',
            game: 'flip-7',
            rules: 1,
            options: {},
            players: ['ann', 'ben'],
        });
        const game = only(play.snapshot().games);
        const draft = game.draft;
        if (!draft) throw new Error('no draft');
        expect(turnOf({ ...game, draft: { ...draft, step: null, ready: false } }, NAMES)).toBe(
            'Every score is in. Check the round before saving it.'
        );
        expect(turnOf({ ...game, draft: null }, NAMES)).toBe('The next round has not started.');
    });

    it("says a Wizard round's bids are next, then its tricks", async () => {
        const { play } = await setUp();
        await play.start({
            id: 'g-1',
            game: 'wizard',
            rules: 1,
            options: {},
            players: ['ann', 'ben', 'cat'],
        });
        expect(turnOf(only(play.snapshot().games), NAMES)).toBe('The bids are next.');
        for (const bid of [1, 0, 0]) await play.enter('g-1', bid);
        expect(turnOf(only(play.snapshot().games), NAMES)).toBe('The tricks are next.');
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

    it('lists every game in play, last changed first, by name, round and turn, and none when there is none', async () => {
        const { play } = await setUp();
        expect(inPlayOf(play.snapshot().games, NAMES)).toEqual([]);
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
        expect(inPlayOf(play.snapshot().games, NAMES)).toEqual([
            { id: 'g-new', name: 'Flip 7', round: 2, turn: "Ann's score is next.", changing: null },
            { id: 'g-old', name: 'Wizard', round: 1, turn: 'The bids are next.', changing: null },
        ]);
        // A saved round opened to change is named, so it is let go rather than the game.
        await play.reopen('g-new', 0);
        expect(inPlayOf(play.snapshot().games, NAMES)[0]).toMatchObject({
            id: 'g-new',
            round: 1,
            changing: 0,
        });
    });
});
