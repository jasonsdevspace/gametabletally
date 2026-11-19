import { GAMES } from '@gametabletally/scoring';

import type { GameInPlay } from '../play/play.js';

/**
 * A game the start screen offers to continue or discard: its name, the round being entered and
 * whose turn it is, in words.
 */
export interface Continuing {
    readonly id: string;
    /** The game's name, as the scoring package gives it. */
    readonly name: string;
    /** The round being entered, counted from one. */
    readonly round: number;
    /** Whose turn it is, or what the round waits on, as a sentence. */
    readonly turn: string;
    /** The saved round opened to change, from 0, which is let go rather than the game, or null. */
    readonly changing: number | null;
}

/** A game's name, as the scoring package gives it, or its id for a game the package does not know. */
export const gameNameOf = (game: string): string =>
    GAMES.find(({ id }) => id === game)?.name ?? game;

/** The games the app has a screen for entering a round of, which is every game it knows. */
const ENTERED = ['flip-7', 'skyjo', 'wizard'];

/** Whether the app has a screen for entering a round of the game. */
export const canEnter = (game: string): boolean => ENTERED.includes(game);

/**
 * What the round being entered waits on, in a sentence: whose score is next, the bids or the
 * tricks of a Wizard round, which are entered for every player on one screen, who ended a Skyjo
 * round, or a round whose every score is in, which the rules take or refuse.
 */
export const turnOf = (game: GameInPlay, names: ReadonlyMap<string, string>): string => {
    const { draft } = game;
    if (draft === null) return 'The next round has not started.';
    const { step } = draft;
    if (step === null)
        return draft.ready
            ? 'Every score is in. The round is ready to save.'
            : 'Every score is in. Check the round before saving it.';
    if (step.player === null || step.part === 'ender') return 'Next, say who ended the round.';
    if (step.part === 'bid') return 'The bids are next.';
    if (step.part === 'tricks') return 'The tricks are next.';
    const name = names.get(step.player);
    return `${name === undefined ? "Another player's" : `${name}'s`} score is next.`;
};

/**
 * Every game in play, in the start screen's words, last changed first: each game the rules have
 * not ended, and each finished game with a round opened to change, which is in play until it is
 * saved or let go.
 */
export const inPlayOf = (
    games: readonly GameInPlay[],
    names: ReadonlyMap<string, string>
): Continuing[] =>
    games
        .filter(
            ({ result, draft, saved }) =>
                result.state === 'in-play' || (draft !== null && draft.index < saved.rounds.length)
        )
        .map((game) => ({
            id: game.saved.id,
            name: gameNameOf(game.saved.game),
            round: (game.draft?.index ?? game.saved.rounds.length) + 1,
            turn: turnOf(game, names),
            changing:
                game.draft !== null && game.draft.index < game.saved.rounds.length
                    ? game.draft.index
                    : null,
        }));
