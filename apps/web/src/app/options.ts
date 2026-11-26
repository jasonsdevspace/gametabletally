import { type Game, type GameOption, GAMES, type OptionValue } from '@gametabletally/scoring';

import type { SavedGame } from '../store/format.js';
import { listOf } from '../website/games.js';

/*
 * A game's rule options, as the scoring package declares them: offered when a game starts, saved
 * with it, and named wherever the game is looked back on when one differs from the published rule.
 */

/** The kinds of option the app draws a field for. */
const KINDS: readonly string[] = ['number', 'switch'];

/**
 * The options a game offers that the app can draw, a number or a switch. One of a kind from a
 * newer package is hidden, and the game is played by its default, the published rule.
 */
export const shownOf = (game: Game): readonly GameOption[] =>
    game.options.filter(({ kind }) => KINDS.includes(kind));

/**
 * Every option the game declares with the value it is played by: the one picked, or the published
 * rule's. Each is saved, so the rules a game was played by live in its data.
 */
export const optionsOf = (
    game: Game,
    picked: Readonly<Record<string, OptionValue>>
): Record<string, OptionValue> =>
    Object.fromEntries(game.options.map(({ id, default: rule }) => [id, picked[id] ?? rule]));

/** Whether two switches rule on the same thing, so they are never on together. */
const clash = (one: GameOption, other: GameOption): boolean =>
    one.kind === 'switch' &&
    other.kind === 'switch' &&
    ((one.excludes ?? []).includes(other.id) || (other.excludes ?? []).includes(one.id));

/**
 * The options picked once one more is, and the switches that pick turned off: a switch turned on
 * turns off each switch it cannot be on with, so the game is never started with two rules on the
 * same thing.
 */
export const pickOption = (
    game: Game,
    picked: Readonly<Record<string, OptionValue>>,
    id: string,
    value: OptionValue
): { readonly picked: Record<string, OptionValue>; readonly off: readonly GameOption[] } => {
    const option = game.options.find((one) => one.id === id);
    const off =
        option && value === true
            ? game.options.filter(
                  (other) =>
                      other.id !== id &&
                      clash(option, other) &&
                      (picked[other.id] ?? other.default) === true
              )
            : [];
    return {
        picked: {
            ...picked,
            [id]: value,
            ...Object.fromEntries(off.map(({ id: one }) => [one, false])),
        },
        off,
    };
};

/**
 * How an option is named in the middle of a sentence, where its name alone would read wrong, as a
 * rule named for a place keeps its capital and takes "the".
 */
const IN_A_SENTENCE: Readonly<Record<string, string>> = { canadian: 'the Canadian rule' };

/** An option's name in the middle of a sentence. */
export const named = (option: GameOption): string =>
    IN_A_SENTENCE[option.id] ?? `${option.name.charAt(0).toLowerCase()}${option.name.slice(1)}`;

/** An option's name at the start of a sentence. */
export const namedFirst = (option: GameOption): string => {
    const name = named(option);
    return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
};

/**
 * The options of a game that differ from the published rules, as a sentence, or nothing where it
 * was played by the book: a number as "a target score of 50", and a switch as played with it or
 * without it.
 */
export const optionWords = (game: Game, options: Readonly<Record<string, unknown>>): string => {
    const played = shownOf(game).flatMap((option) => {
        const value = options[option.id];
        if (value === option.default) return [];
        if (typeof value === 'number')
            return [{ with: true, words: `a ${named(option)} of ${String(value)}` }];
        return typeof value === 'boolean' ? [{ with: value, words: named(option) }] : [];
    });
    const part = (on: boolean) => {
        const words = played.filter((one) => one.with === on).map((one) => one.words);
        return words.length === 0 ? [] : [`${on ? 'with' : 'without'} ${listOf(words, 'and')}`];
    };
    const parts = [...part(true), ...part(false)];
    return parts.length === 0 ? '' : `Played ${parts.join(' and ')}.`;
};

/**
 * The options a saved game was played with that differ from the published rules, as a sentence.
 * A game saved under a version of its rules this build does not declare says nothing, since its
 * published rules may not be the ones this build knows.
 */
export const playedWith = ({
    game,
    rules,
    options,
}: Pick<SavedGame, 'game' | 'rules' | 'options'>): string => {
    const declared = GAMES.find(({ id, rules: version }) => id === game && version === rules);
    return declared ? optionWords(declared, options) : '';
};
