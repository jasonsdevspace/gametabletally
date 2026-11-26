import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, expectTypeOf, it } from 'vitest';

import flip7 from '../options/flip-7/1.json' with { type: 'json' };
import skyjo from '../options/skyjo/1.json' with { type: 'json' };
import wizard from '../options/wizard/1.json' with { type: 'json' };
import { type GameOption, GAMES, score } from './index.js';
import { RULES } from './score.js';

/** An option as a rule set's file pins it: what a saved game's options are read by. */
interface Pinned {
    readonly id: string;
    readonly kind: string;
    readonly default: number | boolean;
    readonly values?: readonly (number | boolean)[];
    readonly excludes?: readonly string[];
}

/** The options one version of a game's rule set was released with. */
interface PinFile {
    readonly game: string;
    readonly rules: number;
    readonly options: readonly Pinned[];
}

/**
 * The options of each rule set as it was released. A game saved under a version names its options
 * by these ids and values, so within a version an id, its kind and its default are fixed, no value
 * is taken away, and the switches a switch excludes stay as they are, since a new exclusion
 * between two options a game could already have on would refuse that game. An option or a value
 * added stays in the version and is not pinned until a file is written again, and so does an
 * exclusion naming an option added with it.
 */
const FILES: readonly PinFile[] = [flip7, skyjo, wizard];

const placeOf = ({ game, rules }: Pick<PinFile, 'game' | 'rules'>): string =>
    `${game}/${rules}.json`;

/**
 * What a switch's exclusions break against its pin, as sentences: a pinned exclusion it dropped,
 * and a new one naming a pinned option, which a saved game could already have had on with it.
 */
const exclusionBreaks = (pinned: readonly Pinned[], pin: Pinned, option: GameOption): string[] => {
    const excludes: readonly string[] = option.kind === 'switch' ? (option.excludes ?? []) : [];
    const lost = (pin.excludes ?? []).filter((other) => !excludes.includes(other));
    const added = excludes.filter(
        (other) => !(pin.excludes ?? []).includes(other) && pinned.some(({ id }) => id === other)
    );
    return [
        ...lost.map((other) => `${pin.id} no longer excludes ${other}`),
        ...added.map((other) => `${pin.id} now excludes ${other}`),
    ];
};

/** What a pinned option's declaration breaks, if anything, as sentences. */
const breaks = (pinned: readonly Pinned[], declared: readonly GameOption[]): string[] =>
    pinned.flatMap((pin) => {
        const option = declared.find(({ id }) => id === pin.id);
        if (!option) return [`${pin.id} is gone`];
        if (option.kind !== pin.kind) return [`${pin.id} changed its kind`];
        const found: string[] = [];
        if (option.default !== pin.default) found.push(`${pin.id} changed its default`);
        const values: readonly (number | boolean)[] = option.kind === 'number' ? option.values : [];
        for (const value of pin.values ?? [])
            if (!values.includes(value)) found.push(`${pin.id} lost the value ${String(value)}`);
        return [...found, ...exclusionBreaks(pinned, pin, option)];
    });

it('pins the options of every rule set of every game, in a file kept where it says', () => {
    const root = fileURLToPath(new URL('../options', import.meta.url));
    const kept = readdirSync(root, { recursive: true, withFileTypes: true })
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
        .sort();
    expect(FILES.map(placeOf).sort()).toEqual(kept);
    expect(FILES.map(placeOf).sort()).toEqual(
        RULES.map(({ id, rules }) => placeOf({ game: id, rules })).sort()
    );
});

describe.each(FILES)('the options of $game, rule set $rules', ({ game, rules, options }) => {
    it('keep every id, kind, default and value they were released with', () => {
        const declared = RULES.find((one) => one.id === game && one.rules === rules);
        expect(breaks(options, declared?.options ?? [])).toEqual([]);
    });
});

describe('the check of a rule set against its pinned options', () => {
    const pinned: readonly Pinned[] = [
        { id: 'target-score', kind: 'number', default: 200, values: [100, 200] },
    ];
    const option = (fields: Partial<Extract<GameOption, { kind: 'number' }>>): GameOption => ({
        kind: 'number',
        id: 'target-score',
        name: 'Target score',
        description: 'The game ends at this total.',
        default: 200,
        values: [100, 200],
        ...fields,
    });

    it('passes an option or a value added', () => {
        const added: GameOption = {
            kind: 'switch',
            id: 'house',
            name: 'House',
            description: 'A house rule.',
            default: false,
        };
        expect(breaks(pinned, [option({ values: [100, 200, 300] }), added])).toEqual([]);
    });

    it('fails a default moved, a value taken away, a kind changed or an option gone', () => {
        expect(breaks(pinned, [option({ default: 100 })])).toEqual([
            'target-score changed its default',
        ]);
        expect(breaks(pinned, [option({ values: [200] })])).toEqual([
            'target-score lost the value 100',
        ]);
        expect(
            breaks(pinned, [
                {
                    kind: 'switch',
                    id: 'target-score',
                    name: 'Target score',
                    description: 'The game ends at this total.',
                    default: false,
                },
            ])
        ).toEqual(['target-score changed its kind']);
        expect(breaks(pinned, [])).toEqual(['target-score is gone']);
    });

    it('holds a switch to the switches it cannot be on with, but lets it exclude one added with it', () => {
        const pins: readonly Pinned[] = [
            { id: 'one', kind: 'switch', default: false, excludes: ['two'] },
            { id: 'two', kind: 'switch', default: false, excludes: ['one'] },
            { id: 'three', kind: 'switch', default: false },
        ];
        const switchOf = (id: string, excludes?: readonly string[]): GameOption => ({
            kind: 'switch',
            id,
            name: id,
            description: id,
            default: false,
            ...(excludes ? { excludes } : {}),
        });
        expect(
            breaks(pins, [switchOf('one', ['two']), switchOf('two', ['one']), switchOf('three')])
        ).toEqual([]);
        expect(
            breaks(pins, [switchOf('one'), switchOf('two', ['one']), switchOf('three')])
        ).toEqual(['one no longer excludes two']);
        expect(
            breaks(pins, [
                switchOf('one', ['two']),
                switchOf('two', ['one']),
                switchOf('three', ['one']),
            ])
        ).toEqual(['three now excludes one']);
        expect(
            breaks(pins, [
                switchOf('one', ['two']),
                switchOf('two', ['one']),
                switchOf('three', ['four']),
                switchOf('four', ['three']),
            ])
        ).toEqual([]);
    });
});

describe('an option as GAMES declares it', () => {
    it('types its default and its values by its kind', () => {
        const either = (option: GameOption): number => {
            if (option.kind === 'number') {
                expectTypeOf(option.default).toEqualTypeOf<number>();
                expectTypeOf(option.values).toEqualTypeOf<readonly number[]>();
                return option.default;
            }
            expectTypeOf(option.kind).toEqualTypeOf<'switch'>();
            expectTypeOf(option.default).toEqualTypeOf<boolean>();
            // @ts-expect-error A switch is on or off, and lists no values.
            expect(option.values).toBeUndefined();
            return option.default ? 1 : 0;
        };
        expect(GAMES.flatMap(({ options }) => options).map(either)).toEqual([200, 100, 0, 0]);
    });

    it('cannot be changed through GAMES, so what score accepts stays the rules', () => {
        for (const { options } of GAMES) {
            expect(Object.isFrozen(options)).toBe(true);
            for (const option of options) {
                expect(Object.isFrozen(option)).toBe(true);
                if (option.kind === 'number') expect(Object.isFrozen(option.values)).toBe(true);
                else if (option.excludes) expect(Object.isFrozen(option.excludes)).toBe(true);
            }
        }
        const [flip] = GAMES;
        const target = flip?.options[0];
        if (target?.kind !== 'number') throw new Error('Flip 7 has no target score');
        expect(() => Reflect.apply(Array.prototype.push, target.values, [175])).toThrow(TypeError);
        const answer = score({
            game: 'flip-7',
            rules: 1,
            options: { 'target-score': 175 },
            players: ['ann', 'ben', 'cat'],
            rounds: [],
        });
        expect(answer.problems.map(({ code }) => code)).toEqual(['value-not-allowed']);
    });

    it('words a value refused that is not text, a number or true or false without it', () => {
        const answer = score({
            game: 'flip-7',
            rules: 1,
            options: { 'target-score': { points: 100 } },
            players: ['ann', 'ben', 'cat'],
            rounds: [],
        });
        const [problem] = answer.problems;
        expect(problem?.code).toBe('value-not-allowed');
        expect(problem?.data).toEqual({ option: 'target-score', value: null });
        expect(problem?.message).toBe('Target score cannot take the value given in Flip 7.');
    });
});
