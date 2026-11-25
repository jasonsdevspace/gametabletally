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

/** An option's name in the middle of a sentence. */
const named = ({ name }: GameOption): string => `${name.charAt(0).toLowerCase()}${name.slice(1)}`;

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
