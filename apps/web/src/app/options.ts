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

/**
 * The options a game was played with that differ from the published rules, as a sentence, or
 * nothing where it was played by the book.
 */
export const playedWith = ({ game, options }: Pick<SavedGame, 'game' | 'options'>): string => {
    const declared = GAMES.find(({ id }) => id === game);
    const changed = (declared ? shownOf(declared) : []).flatMap((option) => {
        const value = options[option.id];
        if (value === option.default) return [];
        if (typeof value === 'number') return [`${option.name} ${String(value)}`];
        return typeof value === 'boolean' ? [`${option.name} ${value ? 'on' : 'off'}`] : [];
    });
    return changed.length === 0 ? '' : `Played with ${listOf(changed, 'and')}.`;
};
