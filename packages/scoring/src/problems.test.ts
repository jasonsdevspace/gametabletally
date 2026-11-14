import { readFileSync } from 'node:fs';

import { describe, expect, expectTypeOf, it } from 'vitest';

import {
    type Problem,
    type ProblemCode,
    type ProblemData,
    type ProblemOf,
    score,
} from './index.js';
import { refusal } from './rules.js';

/**
 * Each code a problem can carry, held by the type check to be every code the types know and no
 * other, so the README's table can be read against it.
 */
const CODES = {
    'not-json': true,
    'not-a-game': true,
    'unknown-game': true,
    'unknown-rules': true,
    'too-few-players': true,
    'too-many-players': true,
    'player-twice': true,
    'unknown-option': true,
    'not-a-round': true,
    'unknown-out': true,
    'out-twice': true,
    'too-few-in-round': true,
    'round-unfinished': true,
    'no-ender': true,
    'unknown-ender': true,
    'ender-out': true,
    'after-a-gap': true,
    'after-the-end': true,
    'unknown-player': true,
    'out-with-entry': true,
    'not-an-entry': true,
    'unknown-card': true,
    'number-twice': true,
    'modifier-twice': true,
    'too-many-cards': true,
    'too-many-copies': true,
    'impossible-total': true,
    'too-many-numbers': true,
    'impossible-bid': true,
    'impossible-tricks': true,
    'trick-total': true,
} as const satisfies Record<ProblemCode, true>;

/** The codes the README's table of codes lists, in its first column. */
const documented = (): string[] => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    return [...readme.matchAll(/^\| `([a-z0-9-]+)`\s+\|/gm)].map((match) => match[1] ?? '');
};

/** A problem as the package hands one back, its code known only by narrowing. */
const asProblem = (problem: Problem): Problem => problem;

/** The first problem a game of Skyjo with too many cards in a hand is refused with. */
const refused = (): Problem => {
    const answer = score({
        game: 'skyjo',
        rules: 1,
        options: {},
        players: ['ann', 'ben'],
        rounds: [{ entries: { ann: { cards: Array.from({ length: 13 }, () => 0) } } }],
    });
    const [first] = answer.problems;
    if (first === undefined) throw new Error('the game was not refused');
    return first;
};

describe('the data a problem carries', () => {
    it('has a type for every code the README lists, and none it does not', () => {
        expect(documented().sort()).toEqual(Object.keys(CODES).sort());
    });

    it('gives the fields of its code once narrowed on it', () => {
        const problem = refused();
        expect(problem.code).toBe('too-many-cards');
        if (problem.code !== 'too-many-cards') throw new Error(`refused as ${problem.code}`);
        expectTypeOf(problem.data).toEqualTypeOf<{
            readonly max: number;
            readonly given: number;
        }>();
        expect(problem.data.max - problem.data.given).toBe(-1);
    });

    it('refuses, at the type check, a field its code does not carry', () => {
        const problem = refused();
        if (problem.code !== 'too-many-cards') throw new Error(`refused as ${problem.code}`);
        // @ts-expect-error A grid's limit carries no card.
        expect(problem.data.card).toBeUndefined();
        const before = asProblem({ ...problem, code: 'no-ender', data: {} });
        if (before.code !== 'no-ender') throw new Error(`refused as ${before.code}`);
        // @ts-expect-error A round with no ender carries nothing.
        expect(before.data.ender).toBeUndefined();
    });

    it('holds a part that may be missing to a check before it is read', () => {
        const problem = asProblem({
            code: 'not-an-entry',
            message: '',
            data: { part: 'cards' },
            round: 0,
            player: 'ann',
        });
        if (problem.code !== 'not-an-entry') throw new Error(`refused as ${problem.code}`);
        // @ts-expect-error An entry that is not an object at all names no part.
        expect(problem.data.part).toBe('cards');
        expect('part' in problem.data ? problem.data.part : null).toBe('cards');
    });

    it('keeps each code with its own data in a problem of several codes', () => {
        const either = (problem: ProblemOf<'too-many-cards' | 'no-ender'>): number =>
            problem.code === 'too-many-cards' ? problem.data.given : 0;
        const problem = refused();
        if (problem.code !== 'too-many-cards') throw new Error(`refused as ${problem.code}`);
        expect(either(problem)).toBe(13);
        expectTypeOf<ProblemOf<'no-ender'>['data']>().toEqualTypeOf<ProblemData['no-ender']>();
    });

    it('refuses, at the type check, a code raised with data that is not its own', () => {
        // @ts-expect-error A grid's limit needs the number given.
        expect(refusal('too-many-cards', '', { max: 12 }).code).toBe('too-many-cards');
        // @ts-expect-error A grid's limit needs its data at all.
        expect(refusal('too-many-cards', '', {}).code).toBe('too-many-cards');
        // @ts-expect-error A round with no ender carries nothing.
        expect(refusal('no-ender', '', { ender: 'ann' }).code).toBe('no-ender');
        // @ts-expect-error There is no such code.
        expect(refusal('no-such-code', '', {}).code).toBe('no-such-code');
        expect(refusal('no-ender', '', {}).data).toEqual({});
    });
});
