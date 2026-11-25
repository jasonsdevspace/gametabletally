import { describe, expect, it } from 'vitest';

import type { SavedGame } from '../store/format.js';
import { hasGameInPlay, recordOf, rounded } from './record.js';

/* A player's record, worked out from saved games with no page and no database. */

let made = 0;

/** A game as the store saves it, finished unless a draft is given. */
const saved = (
    game: string,
    players: readonly string[],
    rounds: readonly unknown[],
    draft: SavedGame['draft'] = null
): SavedGame => {
    made += 1;
    return {
        id: `g-${String(made)}`,
        game,
        rules: 1,
        options: {},
        players,
        rounds,
        draft,
        started: '2026-11-20T19:00:00.000Z',
        changed: '2026-11-20T21:00:00.000Z',
    };
};

const SEVEN = [12, 11, 10, 9, 8, 7, 6];
const hand = (numbers: readonly number[], modifiers: readonly string[] = []) => ({
    numbers,
    modifiers,
    bust: false,
});

/**
 * A game of Flip 7 over two rounds, in which the seat given scores 151 and then 78, ending on 229,
 * and every other seat scores its own number of the round, so the totals are known.
 */
const flip7 = (players: readonly string[], winner: string, small: readonly number[] = [1, 2]) =>
    saved(
        'flip-7',
        players,
        small.map((low, at) => ({
            entries: Object.fromEntries(
                players.map((one) => [
                    one,
                    one === winner
                        ? at === 0
                            ? hand(SEVEN, ['x2', '+10'])
                            : hand(SEVEN)
                        : hand([low]),
                ])
            ),
        }))
    );

/** A game of Skyjo of one round per totals given, each ended by the lowest of it. */
const skyjo = (players: readonly string[], rounds: readonly (readonly number[])[]) =>
    saved(
        'skyjo',
        players,
        rounds.map((totals) => {
            const lowest = Math.min(...totals);
            return {
                entries: Object.fromEntries(
                    players.map((one, seat) => [one, { total: totals[seat] ?? 0 }])
                ),
                ender: players[totals.indexOf(lowest)],
            };
        })
    );

/**
 * A whole game of Wizard for six players, ten rounds, in which the bids of the seats given are met
 * with every trick and the rest bid nothing and take nothing, each met bid scoring twenty and ten a
 * trick. With two seats given they take the tricks in turn, round by round.
 */
const wizard = (players: readonly string[], takers: readonly string[]) =>
    saved(
        'wizard',
        players,
        Array.from({ length: 10 }, (_, at) => {
            const cards = at + 1;
            const taker = takers[at % takers.length];
            return {
                entries: Object.fromEntries(
                    players.map((one) =>
                        one === taker
                            ? [one, { bid: cards, tricks: cards }]
                            : [one, { bid: 0, tricks: 0 }]
                    )
                ),
            };
        })
    );

const SIX = ['ann', 'ben', 'cat', 'dan', 'eve', 'fay'];

describe("a player's record", () => {
    it('counts the games played and the games won, for each game on its own', () => {
        const games = [
            flip7(['ann', 'ben', 'dan'], 'ann'),
            flip7(['ann', 'ben', 'dan'], 'ben'),
            flip7(['ann', 'ben', 'cat'], 'ann'),
            skyjo(
                ['ann', 'ben'],
                [
                    [50, 5],
                    [50, 5],
                ]
            ),
        ];
        expect(recordOf(games, 'ann').map(({ game, played, won }) => [game, played, won])).toEqual([
            ['flip-7', 3, 2],
            ['skyjo', 1, 0],
        ]);
        expect(recordOf(games, 'cat').map(({ game, played, won }) => [game, played, won])).toEqual([
            ['flip-7', 1, 0],
        ]);
    });

    it('names each game and which way its totals are ahead, in the order the games are listed', () => {
        const games = [
            wizard(SIX, ['ann']),
            skyjo(
                ['ann', 'ben'],
                [
                    [50, 5],
                    [50, 5],
                ]
            ),
            flip7(['ann', 'ben', 'dan'], 'ann'),
        ];
        expect(recordOf(games, 'ann').map(({ name, ahead }) => [name, ahead])).toEqual([
            ['Flip 7', 'highest'],
            ['Skyjo', 'lowest'],
            ['Wizard', 'highest'],
        ]);
    });

    it('takes the highest total as the best in Flip 7', () => {
        // Ben ends one game on 1 and 2, 3 in all, and another on 5 and 6, 11 in all.
        const games = [
            flip7(['ann', 'ben', 'dan'], 'ann', [1, 2]),
            flip7(['ann', 'ben', 'dan'], 'ann', [5, 6]),
        ];
        expect(recordOf(games, 'ben')[0]?.best).toBe(11);
    });

    it('takes the highest total as the best in Wizard', () => {
        // Ann takes every trick in one game, 20 plus 10 a trick each round, 750 in all, and every
        // second round in the other, 20 a round and 10 a trick in rounds 1, 3, 5, 7 and 9, 450.
        const games = [wizard(SIX, ['ann', 'ben']), wizard(SIX, ['ann'])];
        expect(recordOf(games, 'ann')[0]?.best).toBe(750);
    });

    it('takes the lowest total as the best in Skyjo, where the lowest total wins', () => {
        const games = [
            skyjo(
                ['ann', 'ben'],
                [
                    [50, 20],
                    [50, 25],
                ]
            ),
            skyjo(
                ['ann', 'ben'],
                [
                    [50, 4],
                    [50, 6],
                ]
            ),
        ];
        expect(recordOf(games, 'ben')[0]?.best).toBe(10);
        expect(recordOf(games, 'ann')[0]?.best).toBe(100);
    });

    it('averages the totals of the games played', () => {
        // Ben ends on 3, 11 and 229, which come to 243 over three games.
        const games = [
            flip7(['ann', 'ben', 'dan'], 'ann', [1, 2]),
            flip7(['ann', 'ben', 'dan'], 'ann', [5, 6]),
            flip7(['ann', 'ben', 'dan'], 'ben'),
        ];
        expect(recordOf(games, 'ben')[0]?.average).toBe(81);
        // Ann ends on 229, 229 and 3.
        expect(recordOf(games, 'ann')[0]?.average).toBeCloseTo(461 / 3);
    });

    it('counts a game in play in no stat', () => {
        const games = [
            flip7(['ann', 'ben', 'dan'], 'ann'),
            // One round in, with the next being entered.
            saved(
                'flip-7',
                ['ann', 'ben', 'dan'],
                [{ entries: { ann: hand([12]), ben: hand([1]), dan: hand([2]) } }],
                {
                    index: 1,
                    round: { entries: {} },
                    step: { player: 'ann', part: 'entry' },
                }
            ),
        ];
        expect(recordOf(games, 'ann')).toEqual([
            {
                game: 'flip-7',
                name: 'Flip 7',
                ahead: 'highest',
                played: 1,
                won: 1,
                best: 229,
                average: 229,
            },
        ]);
    });

    it('counts a finished game with a saved round opened to change in no stat, since it is in play', () => {
        const finished = flip7(['ann', 'ben', 'dan'], 'ann');
        const reopened: SavedGame = {
            ...finished,
            draft: { index: 0, round: { entries: {} }, step: { player: 'ann', part: 'entry' } },
        };
        expect(recordOf([reopened], 'ann')).toEqual([]);
    });

    it('counts a shared win as a win for each player who shares it', () => {
        // Ben and Cat hold nothing in either round and end level on the lowest total, 0.
        const games = [
            skyjo(
                ['ann', 'ben', 'cat'],
                [
                    [50, 0, 0],
                    [50, 0, 0],
                ]
            ),
        ];
        expect(recordOf(games, 'ben')[0]?.won).toBe(1);
        expect(recordOf(games, 'cat')[0]?.won).toBe(1);
        expect(recordOf(games, 'ann')[0]?.won).toBe(0);
    });

    it('counts a game the player missed a round of as played and never as won', () => {
        // Ann is out of the first round and still reaches the highest total, 229, which ends the
        // game, but the win goes to the highest of those who missed no round.
        const game = saved(
            'flip-7',
            ['ann', 'ben', 'cat'],
            [
                { entries: { ben: hand([3]), cat: hand([4]) }, out: ['ann'] },
                { entries: { ann: hand(SEVEN, ['x2', '+10']), ben: hand([3]), cat: hand([4]) } },
                { entries: { ann: hand(SEVEN), ben: hand([3]), cat: hand([4]) } },
            ]
        );
        expect(recordOf([game], 'ann')).toEqual([
            {
                game: 'flip-7',
                name: 'Flip 7',
                ahead: 'highest',
                played: 1,
                won: 0,
                best: 229,
                average: 229,
            },
        ]);
        expect(recordOf([game], 'cat')[0]?.won).toBe(1);
    });

    it('is empty for a player who has played no game, or only games still in play', () => {
        expect(recordOf([], 'ann')).toEqual([]);
        expect(recordOf([flip7(['ben', 'cat', 'dan'], 'ben')], 'ann')).toEqual([]);
        const inPlay = saved('skyjo', ['ann', 'ben'], [], {
            index: 0,
            round: { entries: {} },
            step: { player: 'ann', part: 'entry' },
        });
        expect(recordOf([inPlay], 'ann')).toEqual([]);
    });
});

describe('whether a player has a game in play', () => {
    const inPlay = saved('skyjo', ['ann', 'ben'], [], {
        index: 0,
        round: { entries: {} },
        step: { player: 'ann', part: 'entry' },
    });

    it('takes a game the record would count once it ends', () => {
        expect(hasGameInPlay([inPlay], 'ann')).toBe(true);
        expect(hasGameInPlay([inPlay], 'cat')).toBe(false);
    });

    it('takes no finished game, and no game the record cannot score', () => {
        expect(hasGameInPlay([flip7(['ann', 'ben', 'dan'], 'ann')], 'ann')).toBe(false);
        expect(hasGameInPlay([saved('no-such-game', ['ann', 'ben'], [])], 'ann')).toBe(false);
    });
});

describe('an average as the record shows it', () => {
    it('rounds half away from zero, either side of it', () => {
        expect(rounded(2.5)).toBe(3);
        expect(rounded(-2.5)).toBe(-3);
        expect(rounded(-0.5)).toBe(-1);
        expect(rounded(116.4)).toBe(116);
    });

    it('never gives a negative zero', () => {
        expect(Object.is(rounded(-0.4), 0)).toBe(true);
    });
});
