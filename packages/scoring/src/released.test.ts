import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import flip7 from '../cases/flip-7/1.json' with { type: 'json' };
import skyjo from '../cases/skyjo/1.json' with { type: 'json' };
import wizard from '../cases/wizard/1.json' with { type: 'json' };
import flip7Pins from '../released/flip-7/1.json' with { type: 'json' };
import skyjoPins from '../released/skyjo/1.json' with { type: 'json' };
import wizardPins from '../released/wizard/1.json' with { type: 'json' };
import {
    breaks,
    pinned,
    type PinnedCase,
    type PinnedFile,
    type Pins,
    unpinned,
} from '../scripts/released.mjs';
import { RULES } from './score.js';

/*
 * A version of a rule set always means the same rules, so a phone and a server on different builds
 * score a game that names it the same way. Every case's released answer is pinned in `released`, and
 * a change to how a game scores, a correction included, is a new version, as record 5 sets out.
 */

/** Each rule set's cases, with the answers it was released with, as `npm run pin-cases` wrote. */
const FILES: readonly (readonly [PinnedFile, Pins])[] = [
    [flip7, flip7Pins],
    [skyjo, skyjoPins],
    [wizard, wizardPins],
];

it('keeps a file of released answers for every rule set the package holds, and no other', () => {
    const root = fileURLToPath(new URL('../released', import.meta.url));
    const kept = readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
        .sort();
    expect(kept).toEqual(RULES.map(({ id, rules }) => `${id}/${String(rules)}.json`).sort());
    expect(kept).toEqual(FILES.map(([{ game, rules }]) => `${game}/${String(rules)}.json`).sort());
});

describe.each(
    FILES.map(([file, pins]) => ({ name: `${file.game} ${String(file.rules)}`, file, pins }))
)('the released answers of $name', ({ file, pins }) => {
    it('name the rule set of their cases', () => {
        expect([pins.game, pins.rules]).toEqual([file.game, file.rules]);
    });

    it('are each still given, and none has changed', () => {
        expect(breaks(pins, file)).toEqual([]);
    });

    it('pin every case, so none goes out unheld', () => {
        expect(unpinned(pins, file)).toEqual([]);
    });
});

describe('a released answer', () => {
    const game = (players: readonly string[]) => ({ game: 'g', rules: 1, players });
    const scored: PinnedCase = {
        name: 'a game scored',
        input: game(['ann', 'ben']),
        expect: { rounds: [{ state: 'scored' }], problems: [] },
    };
    const unknownOption: PinnedCase = {
        name: 'a game naming an option the rule set does not have',
        input: { ...game(['ann', 'ben']), options: { house: true } },
        expect: { rounds: [], problems: [{ code: 'unknown-option', round: null }] },
    };
    const tooFew: PinnedCase = {
        name: 'a game with too few players',
        input: game(['ann']),
        expect: {
            rounds: [{ state: 'skipped' }],
            problems: [{ code: 'too-few-players', round: null }],
        },
    };
    const file = (cases: readonly PinnedCase[]): PinnedFile => ({ game: 'g', rules: 1, cases });
    const all = [scored, unknownOption, tooFew];
    const released = pinned({ game: 'g', rules: 1, answers: [] }, file(all));
    const answered = (one: PinnedCase): PinnedCase => ({
        ...one,
        expect: { rounds: [{ state: 'scored' }], problems: [] },
    });

    it('holds every case it pinned', () => {
        expect(breaks(released, file(all))).toEqual([]);
        expect(unpinned(released, file(all))).toEqual([]);
    });

    it('may not change, nor its case be taken away, which is named', () => {
        const corrected: PinnedCase = {
            ...scored,
            expect: { rounds: [{ state: 'refused' }], problems: [] },
        };
        expect(breaks(released, file([corrected, unknownOption, tooFew]))).toEqual([
            'the answer to "a game scored" changed',
        ]);
        expect(breaks(released, file([unknownOption, tooFew]))).toEqual([
            'the case "a game scored" is gone',
        ]);
    });

    it('may change where it refused a game for an option the rule set did not have, which gave no score', () => {
        const accepted = answered(unknownOption);
        expect(breaks(released, file([scored, accepted, tooFew]))).toEqual([]);
        expect(pinned(released, file([scored, accepted, tooFew])).answers[1]?.liftable).toBe(false);
    });

    it('may not change where it refused a game for anything else, such as its players', () => {
        expect(breaks(released, file([scored, unknownOption, answered(tooFew)]))).toEqual([
            'the answer to "a game with too few players" changed',
        ]);
    });

    it('names a case added after it until the case is pinned', () => {
        const added: PinnedCase = { ...scored, name: 'a case added', input: game(['cat', 'dan']) };
        expect(unpinned(released, file([...all, added]))).toEqual(['a case added']);
    });
});
