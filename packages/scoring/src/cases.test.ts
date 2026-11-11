import { describe, expect, it } from 'vitest';

import flip7 from '../cases/flip-7.json' with { type: 'json' };
import { GAMES, score } from './index.js';

/**
 * The rules as cases: a game in, the answer out. They are the contract another implementation
 * of a game's rules has to pass, so they are run here as they are written, and again against
 * the built file in a runtime that is not Node.
 */
const FILES = [flip7];

/**
 * An answer as a case states it. A problem's sentence is this implementation's own wording, so
 * a case holds its code and its place and never the sentence.
 */
const comparable = (input: Parameters<typeof score>[0]) => {
    const { problems, ...rest } = score(input);
    return {
        ...rest,
        problems: problems.map(({ code, round, player }) => ({ code, round, player })),
    };
};

describe.each(FILES)('the cases for $game', ({ game, rules, cases }) => {
    it('are written for the rule set the package holds', () => {
        expect(GAMES.find((known) => known.id === game)?.rules).toBe(rules);
    });

    it('each have a name of their own', () => {
        const names = cases.map(({ name }) => name);
        expect(new Set(names).size).toBe(names.length);
    });

    it.each(cases)('$name', ({ input, expect: expected }) => {
        expect(comparable(input)).toEqual(expected);
    });

    it('say every refusal in a sentence', () => {
        for (const { input } of cases)
            for (const { message } of score(input).problems) expect(message).toMatch(/^[A-Z].*\.$/);
    });
});
