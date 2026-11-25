import type { GameInPlay } from '../play/play.js';
import { compareInstants } from '../store/format.js';
import { listOf } from '../website/games.js';
import { gameNameOf } from './in-play.js';
import { nameIn } from './opened-game.js';

/*
 * The finished games as the history lists them. Who won is the scoring package's answer for each
 * game, worked out as the list opens from the rounds the game saved, and never saved itself.
 */

/** A finished game as a row of the history says it. */
export interface FinishedGame {
    readonly id: string;
    /** Who won, in words. */
    readonly won: string;
    /** The game's name. */
    readonly game: string;
    /** The day it was started, written out in the form the formatter gives. */
    readonly date: string;
    /** The players, in seat order. */
    readonly players: string;
}

/** Who won, in a few words, alone or sharing the win, or that the rules named no one. */
export const wonBy = (winners: readonly string[]): string => {
    if (winners.length === 0) return 'No winner';
    const named = listOf(winners, 'and');
    return winners.length === 1 ? `${named} won` : `${named} shared the win`;
};

/**
 * Whether the rules have ended a game and no saved round of it is open to change, which would put
 * it back in play until it is saved or let go, as the start screen offers it then.
 */
const isFinished = ({ result, draft, saved }: GameInPlay): boolean =>
    result.state === 'over' && (draft === null || draft.index >= saved.rounds.length);

/**
 * The newest first, by the moment each was started, which nothing done to a game later changes,
 * so a round changed in an old game or a game put back after a delete keeps its place.
 */
const startedLastFirst = (first: GameInPlay, second: GameInPlay): number =>
    compareInstants(second.saved.started, first.saved.started) ||
    first.saved.id.localeCompare(second.saved.id);

/**
 * Every finished game, the newest first, with who won, the game, the day it was started in the form
 * the formatter writes and the players' names. A game in play is left out, since the start screen
 * offers it.
 */
export const finishedOf = (
    games: readonly GameInPlay[],
    names: ReadonlyMap<string, string>,
    dates: Intl.DateTimeFormat
): FinishedGame[] =>
    games
        .filter(isFinished)
        .sort(startedLastFirst)
        .map(({ saved, result }) => ({
            id: saved.id,
            won: wonBy(result.winners.map((one) => nameIn(names, one))),
            game: gameNameOf(saved.game),
            date: dates.format(new Date(saved.started)),
            players: listOf(
                saved.players.map((one) => nameIn(names, one)),
                'and'
            ),
        }));
