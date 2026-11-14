import { describe, expect, it } from 'vitest';

import { GAMES, score, type ScoreInput, scoreJson } from './index.js';

/** A hand that did not bust. */
const hand = (numbers: readonly unknown[], modifiers: readonly string[] = []) => ({
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

    it('says which rule set a new game starts under, which way is ahead and how many can play', () => {
        expect(GAMES).toEqual([
            {
                id: 'flip-7',
                name: 'Flip 7',
                rules: 1,
                ahead: 'highest',
                minPlayers: 3,
                maxPlayers: null,
            },
            { id: 'skyjo', name: 'Skyjo', rules: 1, ahead: 'lowest', minPlayers: 2, maxPlayers: 8 },
            {
                id: 'wizard',
                name: 'Wizard',
                rules: 1,
                ahead: 'highest',
                minPlayers: 3,
                maxPlayers: 6,
            },
        ]);
    });
});

describe('scoring a game', () => {
    it('refuses a list of players out with a hole in it, as JSON cannot write one', () => {
        // A sparse array, which a caller in TypeScript can hand over and JSON never holds.
        // eslint-disable-next-line no-sparse-arrays
        const out = [, 'cat'];
        const result = score({
            game: 'skyjo',
            rules: 1,
            options: {},
            players: ['ann', 'ben', 'cat'],
            rounds: [{ entries: { ann: { total: 3 }, ben: { total: 4 } }, ender: 'ann', out }],
        });
        expect(result.problems.map(({ code, data }) => ({ code, data }))).toEqual([
            { code: 'not-a-round', data: { part: 'out' } },
        ]);
        expect(result.rounds[0]?.state).toBe('refused');
    });

    it('refuses a game it does not know, and scores nothing in it', () => {
        const result = score({ ...game([FIRST]), game: 'chess' });
        expect(result.problems.map(({ code }) => code)).toEqual(['unknown-game']);
        expect(result.totals).toEqual({ ann: 0, ben: 0, cat: 0 });
        expect(result.rounds).toEqual([{ state: 'skipped', scores: {}, out: [] }]);
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
        const both = score(game([FIRST, SECOND]));
        const one = score(game([FIRST]));
        expect(one.totals).toEqual({ ann: 10, ben: 9, cat: 8 });
        expect(one.rounds).toEqual(both.rounds.slice(0, 1));
    });

    it('changes nothing it is given', () => {
        const input = frozen(game([FIRST, SECOND]));
        expect(() => score(input)).not.toThrow();
    });

    it('answers in values that survive being written as JSON', () => {
        const result = score(game([FIRST, { entries: { ann: hand([5, 5]) } }]));
        expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
    });

    it('refuses a card that is not there at all, where a caller with no type checker passes one', () => {
        const result = score(
            game([{ entries: { ann: hand([undefined, 5]), ben: hand([9]), cat: hand([8]) } }])
        );
        expect(result.problems.map(({ code, player }) => [code, player])).toEqual([
            ['unknown-card', 'ann'],
        ]);
        // A card that is not there has no value to carry, and null survives being written as
        // JSON where undefined would drop the field.
        expect(result.problems[0]?.data).toEqual({ card: null, kind: 'number' });
        expect(result.rounds[0]?.scores).toEqual({ ben: 9, cat: 8 });
    });

    // A caller in the same runtime can hand over what JSON cannot hold. None of it makes the
    // function throw, and none of it reaches the answer, which is still plain data.
    it.each([
        ['a function', () => 1],
        ['a symbol', Symbol('card')],
        ['a number too large to be a number', 10n],
        ['a number that is not one', Number.NaN],
        [
            'an object that holds itself',
            (() => {
                const loop: Record<string, unknown> = {};
                loop['self'] = loop;
                return loop;
            })(),
        ],
    ])(
        'refuses %s for a card, and answers in data that survives being written as JSON',
        (_, card) => {
            const result = score(
                game([{ entries: { ann: hand([card]), ben: hand([9]), cat: hand([8]) } }])
            );
            expect(result.problems.map(({ code, data }) => [code, data])).toEqual([
                ['unknown-card', { card: null, kind: 'number' }],
            ]);
            expect(JSON.parse(JSON.stringify(result))).toStrictEqual(result);
        }
    );

    it('scores a zero written with a minus sign as zero, as the answer written as JSON does', () => {
        const result = score({
            game: 'skyjo',
            rules: 1,
            options: {},
            players: ['ann', 'ben'],
            rounds: [{ entries: { ann: { total: -0 }, ben: { total: 4 } }, ender: 'ann' }],
        });
        expect(Object.is(result.rounds[0]?.scores['ann'], 0)).toBe(true);
        expect(Object.is(result.totals['ann'], 0)).toBe(true);
    });

    it('scores a game saved under a rule set by that rule set, and refuses one it never had', () => {
        expect(score({ ...game([FIRST]), rules: 1 }).problems).toEqual([]);
        expect(score({ ...game([FIRST]), rules: 7 }).problems.map(({ code }) => code)).toEqual([
            'unknown-rules',
        ]);
    });
});

describe('scoring a game handed over as text', () => {
    /** What comes back, read from the text it is written as. */
    const answer = (text: string): unknown => {
        const read: unknown = JSON.parse(scoreJson(text));
        return read;
    };

    it('gives the answer `score` gives', () => {
        const input = game([FIRST, SECOND]);
        expect(answer(JSON.stringify(input))).toEqual(score(input));
    });

    it('answers text that is not JSON with a problem, and does not throw', () => {
        expect(answer('{"game":')).toMatchObject({ problems: [{ code: 'not-json' }], totals: {} });
    });

    it.each([
        ['nothing but a number', '5'],
        ['no id', '{"rules":1,"options":{},"players":["a","b","c"],"rounds":[]}'],
        ['no rule set', '{"game":"flip-7","options":{},"players":["a","b","c"],"rounds":[]}'],
        ['no options', '{"game":"flip-7","rules":1,"players":["a","b","c"],"rounds":[]}'],
        ['null for options', '{"game":"flip-7","rules":1,"options":null,"players":[],"rounds":[]}'],
        ['no players', '{"game":"flip-7","rules":1,"options":{},"rounds":[]}'],
        [
            'a number for a player',
            '{"game":"flip-7","rules":1,"options":{},"players":[1],"rounds":[]}',
        ],
        [
            'an empty player id',
            '{"game":"flip-7","rules":1,"options":{},"players":[""],"rounds":[]}',
        ],
        ['no rounds', '{"game":"flip-7","rules":1,"options":{},"players":["a","b","c"]}'],
    ])('answers a game with %s with a problem, and does not throw', (_, text) => {
        expect(answer(text)).toMatchObject({
            game: '',
            rules: 0,
            state: 'in-play',
            rounds: [],
            totals: {},
            leaders: [],
            winners: [],
            problems: [{ code: 'not-a-game', round: null, player: null }],
        });
    });
});
