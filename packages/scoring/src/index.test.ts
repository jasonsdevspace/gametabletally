import { describe, expect, it } from 'vitest';

import { GAMES, score, type ScoreInput } from './index.js';

/** A hand that did not bust. */
const hand = (numbers: readonly number[], modifiers: readonly string[] = []) => ({
    numbers,
    modifiers,
    bust: false,
});

/** A game of Flip 7 between three players, with the rounds given. */
const game = (rounds: readonly unknown[]): ScoreInput => ({
    game: 'flip-7',
    rules: 1,
    options: {},
    players: ['ann', 'ben', 'cat'],
    rounds,
});

/** Freezes a value and everything in it, so a function that changed its input would throw. */
const frozen = <Value>(value: Value): Value => {
    if (typeof value === 'object' && value !== null) {
        Object.values(value).forEach(frozen);
        Object.freeze(value);
    }
    return value;
};

const FIRST = { entries: { ann: hand([10]), ben: hand([9]), cat: hand([8]) } };
const SECOND = { entries: { ann: hand([1]), ben: hand([2, 3], ['x2']), cat: hand([4]) } };

describe('the games the package knows', () => {
    it('names each by an id of its own, so a saved game points at one game', () => {
        const ids = GAMES.map(({ id }) => id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('writes each id in lowercase words joined by hyphens, so it is safe in an address', () => {
        for (const { id } of GAMES) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });

    it('gives each a name a player can read', () => {
        for (const { name } of GAMES) expect(name.trim()).not.toBe('');
    });

    it('says which rule set a new game starts under and how many can play', () => {
        expect(GAMES.find(({ id }) => id === 'flip-7')).toEqual({
            id: 'flip-7',
            name: 'Flip 7',
            rules: 1,
            minPlayers: 3,
            maxPlayers: null,
        });
    });
});

describe('scoring a game', () => {
    it('refuses a game it does not know, and scores nothing in it', () => {
        const result = score({ ...game([FIRST]), game: 'chess' });
        expect(result.problems.map(({ code }) => code)).toEqual(['unknown-game']);
        expect(result.totals).toEqual({ ann: 0, ben: 0, cat: 0 });
        expect(result.rounds).toEqual([{ state: 'refused', scores: {} }]);
    });

    it('names the rule set the scores were worked out under', () => {
        expect(score(game([FIRST])).rules).toBe(1);
    });

    it('gives the same answer for a changed round as for a game entered that way', () => {
        const before = score(game([FIRST, SECOND]));
        const changed = { entries: { ...FIRST.entries, ann: hand([12, 11], ['+10']) } };
        const after = score(game([changed, SECOND]));
        expect(after.totals).toEqual({ ann: 34, ben: 19, cat: 12 });
        // Scoring the first game again is unmoved by the other having been scored between.
        expect(score(game([FIRST, SECOND]))).toEqual(before);
        expect(before.totals).toEqual({ ann: 11, ben: 19, cat: 12 });
    });

    it('gives the same answer with a round taken back as for a game that never had it', () => {
        score(game([FIRST, SECOND]));
        expect(score(game([FIRST]))).toEqual(score(game([FIRST])));
        expect(score(game([FIRST])).totals).toEqual({ ann: 10, ben: 9, cat: 8 });
    });

    it('changes nothing it is given', () => {
        const input = frozen(game([FIRST, SECOND]));
        expect(() => score(input)).not.toThrow();
    });

    it('answers in values that survive being written as JSON', () => {
        const result = score(game([FIRST, { entries: { ann: hand([5, 5]) } }]));
        expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    });

    it('keeps its totals in whole numbers', () => {
        const { totals } = score(game([FIRST, SECOND]));
        for (const total of Object.values(totals)) expect(Number.isInteger(total)).toBe(true);
    });
});
