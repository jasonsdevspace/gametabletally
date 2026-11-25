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
        for (const saved of games) {
            if (saved.game !== id || !saved.players.includes(player)) continue;
            const result = score(toScoreInput(saved));
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
