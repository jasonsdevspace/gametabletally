import { GAMES } from '@gametabletally/scoring';

import { type GameInPlay, openPlay } from '../play/play.js';
import { type Store, withStore } from '../store/store.js';

/**
 * The game the start screen offers to continue: the one in play that was changed last, with its
 * name, the round being entered and whose turn it is, in words.
 */
export interface Continuing {
    readonly id: string;
    /** The game's name, as the scoring package gives it. */
    readonly name: string;
    /** The round being entered, counted from one. */
    readonly round: number;
    /** Whose turn it is, or what the round waits on, as a sentence. */
    readonly turn: string;
}

/** What a player enters at each part of a round, as the sentence names it. */
const ENTERED = { entry: 'score is', bid: 'bid is', tricks: 'tricks are' } as const;

/**
 * What the round being entered waits on, in a sentence: whose score, bid or tricks are next, who
 * ended a Skyjo round, or a round whose every score is in, which the rules take or refuse.
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
    const what = ENTERED[step.part];
    const name = names.get(step.player);
    return `${name === undefined ? "Another player's" : `${name}'s`} ${what} next.`;
};

/**
 * The game in play that was changed last, in the start screen's words, or null when every game
 * is over or there is none. The games come last changed first.
 */
export const continuingOf = (
    games: readonly GameInPlay[],
    names: ReadonlyMap<string, string>
): Continuing | null => {
    const game = games.find(({ result }) => result.state === 'in-play');
    if (!game) return null;
    return {
        id: game.saved.id,
        name: GAMES.find(({ id }) => id === game.saved.game)?.name ?? game.saved.game,
        round: (game.draft?.index ?? game.saved.rounds.length) + 1,
        turn: turnOf(game, names),
    };
};

/**
 * Reads the game to continue from the phone's database, and lets the database go. The model is
 * handed an ask to keep the games that does nothing, so opening the start screen never asks the
 * browser. Only saving a started game asks that.
 */
export const readContinuing = (open: () => Promise<Store>): Promise<Continuing | null> =>
    withStore(open, async (store) => {
        const play = openPlay(store, undefined, () => Promise.resolve());
        const [, players] = await Promise.all([play.load(), store.players()]);
        return continuingOf(
            play.snapshot().games,
            new Map(players.map(({ id, name }) => [id, name]))
        );
    });
