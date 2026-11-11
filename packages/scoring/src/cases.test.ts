import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import flip7 from '../cases/flip-7.json' with { type: 'json' };
import { GAMES, score, scoreJson } from './index.js';

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
const comparable = (answer: string): unknown => {
    const read: unknown = JSON.parse(answer, (key, value: unknown) =>
        // Dropped as the answer is read, so nothing but a problem's sentence is let go.
        key === 'message' ? undefined : value
    );
    return read;
};

describe.each(FILES)('the cases for $game', ({ game, rules, cases }) => {
    it('are written for the rule set the package holds', () => {
        expect(GAMES.find((known) => known.id === game)?.rules).toBe(rules);
    });

    it('each have a name of their own', () => {
        const names = cases.map(({ name }) => name);
        expect(new Set(names).size).toBe(names.length);
    });

    // A case hands the game over as `text`, where what it holds is not a game at all, or as
    // `input`, which is written as text here. Either way it goes in as text and comes back as
    // text, as it does for a caller in another language and in the run outside Node.
    it.each(cases)('$name', ({ input, text, expect: expected }) => {
        expect(comparable(scoreJson(text ?? JSON.stringify(input)))).toStrictEqual(expected);
    });

    it('say every refusal in a sentence', () => {
        for (const { input } of cases)
            for (const { message } of input ? score(input).problems : [])
                expect(message).toMatch(/^[A-Z].*\.$/);
    });
});
