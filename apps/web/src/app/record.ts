import { GAMES, score } from '@gametabletally/scoring';

import { type SavedGame, toScoreInput } from '../store/format.js';
import { isFinished } from './history.js';

/*
 * A player's record, for each game they have played: worked out from the saved games each time it
 * is asked for and never saved, so a corrected rule set changes it the right way. Only finished
 * games count, the same ones the history lists, and who won each is the scoring package's answer.
 */

/** How a player has done at one game. */
export interface GameRecord {
    /** The game, by the scoring package's id for it. */
    readonly game: string;
    /** The game's name. */
    readonly name: string;
    /** Whether the highest or the lowest total wins the game. */
    readonly ahead: 'highest' | 'lowest';
    /** How many finished games of it the player played. */
    readonly played: number;
    /** How many of those they won, alone or sharing the win. */
    readonly won: number;
    /** Their best total, the highest or the lowest as the game's totals are ahead. */
    readonly best: number;
    /** Their total over those games, divided by how many there are. */
    readonly average: number;
}

/** The player's games of the game given, each with the scoring package's answer for it. */
const scoredFor = (games: readonly SavedGame[], player: string, game: string) =>
    games
        .filter((saved) => saved.game === game && saved.players.includes(player))
        .map((saved) => ({ saved, result: score(toScoreInput(saved)) }));

/**
 * The player's record for each game they have finished, in the order the scoring package lists the
 * games, and empty when they have finished none. A game they missed a round of counts as played,
 * and as won only where the rules name them a winner, which they never do while another player
 * missed no round.
 */
export const recordOf = (games: readonly SavedGame[], player: string): GameRecord[] =>
    GAMES.flatMap(({ id, name, ahead }) => {
        const totals: number[] = [];
        let won = 0;
        for (const { saved, result } of scoredFor(games, player, id)) {
            if (!isFinished({ saved, result })) continue;
            totals.push(result.totals[player] ?? 0);
            if (result.winners.includes(player)) won += 1;
        }
        if (totals.length === 0) return [];
        return [
            {
                game: id,
                name,
                ahead,
                played: totals.length,
                won,
                best: ahead === 'highest' ? Math.max(...totals) : Math.min(...totals),
                average: totals.reduce((sum, total) => sum + total, 0) / totals.length,
            },
        ];
    });

/**
 * Whether the player is in a game that has yet to end, of a game the record counts, so the page
 * can say it counts once it ends. A game this build has no rules for is never counted, so it is
 * never taken for one in play either.
 */
export const hasGameInPlay = (games: readonly SavedGame[], player: string): boolean =>
    GAMES.some(({ id }) => scoredFor(games, player, id).some((one) => !isFinished(one)));

/**
 * An average as the record shows it, a whole number rounded half away from zero on either side of
 * it, so -2.5 shows as -3, never as -2, and nothing shows as -0.
 */
export const rounded = (value: number): number =>
    // Adding zero turns a negative zero, from a small negative average, into a plain one.
    Math.sign(value) * Math.round(Math.abs(value)) + 0;
