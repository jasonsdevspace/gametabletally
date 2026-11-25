import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { openPlay, type Play } from '../play/play.js';
import { openStore } from '../store/store.js';
import { finishedOf, wonBy } from './history.js';

/* The finished games as the history lists them, from games the app's own model played. */

const hand = (numbers: number[], modifiers: string[] = []) => ({ numbers, modifiers, bust: false });
const SEVEN = [12, 11, 10, 9, 8, 7, 6];
const SEATS = ['ann', 'ben', 'cat'];
const NAMES = new Map([
    ['ann', 'Ann'],
    ['ben', 'Ben'],
    ['cat', 'Cat'],
]);
const FORMATS = {
    date: new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' }),
    time: new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' }),
};

/** Enters one round of Flip 7, a hand for each seat in turn, and saves it. */
const round = async (play: Play, id: string, hands: readonly ReturnType<typeof hand>[]) => {
    for (const one of hands) await play.enter(id, one);
    await play.saveRound(id);
};

/** Plays two rounds in which the player in the seat given passes two hundred, ending the game. */
const playToTheEnd = async (play: Play, id: string, winner: number) => {
    const seat = (strong: ReturnType<typeof hand>, at: number) =>
        at === winner ? strong : hand([at + 1]);
    await round(
        play,
        id,
        SEATS.map((_, at) => seat(hand(SEVEN, ['x2', '+10']), at))
    );
    await round(
        play,
        id,
        SEATS.map((_, at) => seat(hand(SEVEN), at))
    );
};

/**
 * Games played by the model on a clock the test sets: one won by Ann, started first but changed
 * last, one won by Ben, and one still in play, newest of all.
 */
const played = async () => {
    const store = await openStore(new IDBFactory());
    let at = '2026-11-14T19:00:00.000Z';
    const play = openPlay(
        store,
        () => at,
        () => Promise.resolve()
    );
    const start = (id: string) =>
        play.start({ id, game: 'flip-7', rules: 1, options: {}, players: SEATS });
    await start('older');
    at = '2026-11-21T19:00:00.000Z';
    await start('newer');
    await playToTheEnd(play, 'newer', 1);
    at = '2026-11-23T19:00:00.000Z';
    await start('in-play');
    await round(play, 'in-play', [hand([3]), hand([4]), hand([5])]);
    at = '2026-11-24T09:00:00.000Z';
    await playToTheEnd(play, 'older', 0);
    return play.snapshot().games;
};

describe('the finished games', () => {
    it('lists the game started last first, whatever was changed since', async () => {
        const listed = finishedOf(await played(), NAMES, FORMATS);
        expect(listed.map(({ id }) => id)).toEqual(['newer', 'older']);
    });

    it('leaves out a game still in play', async () => {
        const listed = finishedOf(await played(), NAMES, FORMATS);
        expect(listed.map(({ id }) => id)).not.toContain('in-play');
    });

    it('names the winner the rules work out, with the game, its date and its players', async () => {
        expect(finishedOf(await played(), NAMES, FORMATS)).toEqual([
            {
                id: 'newer',
                won: 'Ben won with 229',
                game: 'Flip 7',
                date: 'November 21, 2026',
                players: 'Ann, Ben and Cat',
            },
            {
                id: 'older',
                won: 'Ann won with 229',
                game: 'Flip 7',
                date: 'November 14, 2026',
                players: 'Ann, Ben and Cat',
            },
        ]);
    });

    it('leaves out a finished game with a round opened to change, which is in play until saved', async () => {
        const store = await openStore(new IDBFactory());
        const play = openPlay(store, undefined, () => Promise.resolve());
        await play.start({ id: 'g-1', game: 'flip-7', rules: 1, options: {}, players: SEATS });
        await playToTheEnd(play, 'g-1', 0);
        expect(finishedOf(play.snapshot().games, NAMES, FORMATS)).toHaveLength(1);
        await play.reopen('g-1', 0);
        expect(finishedOf(play.snapshot().games, NAMES, FORMATS)).toEqual([]);
    });

    it('adds the time to the date of games started on the same day, and only to theirs', async () => {
        const store = await openStore(new IDBFactory());
        let at = '';
        const play = openPlay(
            store,
            () => at,
            () => Promise.resolve()
        );
        for (const [id, when] of [
            ['morning', '2026-11-21T10:30:00.000Z'],
            ['evening', '2026-11-21T19:00:00.000Z'],
            ['week before', '2026-11-14T19:00:00.000Z'],
        ] as const) {
            at = when;
            await play.start({ id, game: 'flip-7', rules: 1, options: {}, players: SEATS });
            await playToTheEnd(play, id, 0);
        }
        expect(
            finishedOf(play.snapshot().games, NAMES, FORMATS).map(({ id, date }) => [id, date])
        ).toEqual([
            ['evening', 'November 21, 2026, 7:00 PM'],
            ['morning', 'November 21, 2026, 10:30 AM'],
            ['week before', 'November 14, 2026'],
        ]);
    });

    it('lists nothing when no game has finished', () => {
        expect(finishedOf([], NAMES, FORMATS)).toEqual([]);
    });
});

describe('who won, in words', () => {
    it('names one winner, winners who share the win, and a game the rules name no winner of', () => {
        expect(wonBy(['Ann'], 229)).toBe('Ann won with 229');
        expect(wonBy(['Ann', 'Ben', 'Cat'], 210)).toBe(
            'Ann, Ben and Cat shared the win, level on 210'
        );
        expect(wonBy([], 0)).toBe('No winner');
    });
});
