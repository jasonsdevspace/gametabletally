import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import flip7 from '../cases/flip-7/1.json' with { type: 'json' };
import skyjo from '../cases/skyjo/1.json' with { type: 'json' };
import wizard from '../cases/wizard/1.json' with { type: 'json' };
import { score, type ScoreInput, scoreJson } from './index.js';
import { RULES } from './score.js';

/** One case: a game handed over as it is scored, or as text where it is not a game at all. */
interface Case {
    readonly name: string;
    readonly input?: ScoreInput;
    readonly text?: string;
    readonly expect: unknown;
}

/** A game's cases, for one version of its rule set. */
interface CaseFile {
    readonly game: string;
    readonly rules: number;
    readonly cases: readonly Case[];
}

/**
 * The rules as cases: a game in, the answer out. They are the contract another implementation
 * of a game's rules has to pass, so they are run here as they are written, and again against
 * the built script in a runtime that is not Node.
 *
 * Each game has a folder, and each version of its rule set a file in it named by the version, so
 * a game saved under an earlier version is still held to the cases it was scored by. Each file is
 * imported by name, so its cases are typed as `score` takes them. The run outside Node reads the
 * folders, so a test holds this list to them.
 */
const FILES: readonly CaseFile[] = [flip7, skyjo, wizard];

/** Where a file of cases is kept, by the game and the version of its rule set it names. */
const placeOf = ({ game, rules }: Pick<CaseFile, 'game' | 'rules'>): string =>
    `${game}/${rules}.json`;

it('runs every file of cases in the folders, each kept where its game and version say', () => {
    const root = fileURLToPath(new URL('../cases', import.meta.url));
    const kept = readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => relative(root, join(entry.parentPath, entry.name)))
        .sort();
    expect(FILES.map(placeOf).sort()).toEqual(kept);
});

it('has a file of cases for every rule set of every game the package holds', () => {
    expect(FILES.map(placeOf).sort()).toEqual(
        RULES.map(({ id, rules }) => placeOf({ game: id, rules })).sort()
    );
});

/**
 * An answer as a case states it. A problem's sentence is this implementation's own wording, so
 * a case holds its code, its data and its place and never the sentence.
 */
const comparable = (answer: string): unknown => {
    const read: unknown = JSON.parse(answer, (key, value: unknown) =>
        // Dropped as the answer is read, so nothing but a problem's sentence is let go.
        key === 'message' ? undefined : value
    );
    return read;
};

describe.each(FILES)('the cases for $game, rule set $rules', ({ cases }) => {
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
