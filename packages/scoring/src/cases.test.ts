import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import flip7 from '../cases/flip-7.json' with { type: 'json' };
import { GAMES, score } from './index.js';

/**
 * The rules as cases: a game in, the answer out. They are the contract another implementation
 * of a game's rules has to pass, so they are run here as they are written, and again against
 * the built script in a runtime that is not Node.
 *
 * Each file is imported by name, so its cases are typed as `score` takes them. The run outside
 * Node reads the folder, so a test holds this list to the folder.
 */
const FILES = [flip7];

it('runs every file of cases in the folder', () => {
    const folder = readdirSync(new URL('../cases', import.meta.url)).sort();
    expect(FILES.map(({ game }) => `${game}.json`).sort()).toEqual(folder);
});

/**
 * An answer as a case states it. A problem's sentence is this implementation's own wording, so
 * a case holds its code and its place and never the sentence.
 */
const comparable = (input: Parameters<typeof score>[0]) => {
    const { problems, ...rest } = score(input);
    // Written as JSON and read back, as the run outside Node compares it, so the two runs hold an
    // answer to the same thing.
    const written: unknown = JSON.parse(
        JSON.stringify({
            ...rest,
            problems: problems.map(({ code, round, player }) => ({ code, round, player })),
        })
    );
    return written;
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
        expect(comparable(input)).toStrictEqual(expected);
    });

    it('say every refusal in a sentence', () => {
        for (const { input } of cases)
            for (const { message } of score(input).problems) expect(message).toMatch(/^[A-Z].*\.$/);
    });
});
