import { GAMES } from '@gametabletally/scoring';

import { type GameInPlay, openPlay } from '../play/play.js';
import type { Store } from '../store/store.js';

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

/** What the round being entered waits on, in a sentence. */
export const turnOf = (game: GameInPlay, names: ReadonlyMap<string, string>): string => {
    const step = game.draft?.step ?? null;
    if (step === null) return 'The round is entered and ready to save.';
    if (step.player === null) return 'Next, say who ended the round.';
    const name = names.get(step.player);
    return name === undefined ? "It is the next player's turn." : `It is ${name}'s turn.`;
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
 * Reads the game to continue from the phone's database, and lets the database go. Reading asks
 * the browser for nothing, since only starting a game asks it to keep the games.
 */
export const readContinuing = async (open: () => Promise<Store>): Promise<Continuing | null> => {
    const store = await open();
    try {
        const play = openPlay(store, undefined, () => Promise.resolve());
        await play.load();
        const players = await store.players();
        return continuingOf(
            play.snapshot().games,
            new Map(players.map(({ id, name }) => [id, name]))
        );
    } finally {
        store.close();
    }
};
