import type { Game } from '@gametabletally/scoring';

import type { SavedPlayer } from '../store/format.js';

/**
 * The seats of a new game, as player ids in the order the phone goes around the table, and what
 * the new game screen says about them.
 */

/** The seats with one player moved a place toward the first seat or the last. */
export const moveSeat = (seats: readonly string[], id: string, by: -1 | 1): readonly string[] => {
    const from = seats.indexOf(id);
    const to = from + by;
    if (from === -1 || to < 0 || to >= seats.length) return seats;
    const moved = [...seats];
    moved.splice(from, 1);
    moved.splice(to, 0, id);
    return moved;
};

/** A typed name as it is saved: trimmed, with each run of spaces inside it made one space. */
export const cleanName = (typed: string): string => typed.trim().replace(/\s+/g, ' ');

/** Whether two names are the same name, read without regard to case. */
const sameName = (first: string, second: string): boolean =>
    first.localeCompare(second, undefined, { sensitivity: 'accent' }) === 0;

/**
 * The saved player a typed name already belongs to, or undefined for a new name. One still offered
 * is found before a removed one, so a name typed again brings a removed player back only where
 * no one else has it.
 */
export const playerNamed = (
    players: readonly SavedPlayer[],
    name: string
): SavedPlayer | undefined => {
    const named = players.filter((player) => sameName(player.name, name));
    return named.find(({ removed }) => !removed) ?? named[0];
};

/**
 * Why the game cannot start with this many seated, in words, or null when it can: no game chosen,
 * or fewer or more players than the game takes, with how many to add or take off.
 */
export const seatsProblem = (
    game: Pick<Game, 'name' | 'minPlayers' | 'maxPlayers'> | undefined,
    seated: number
): string | null => {
    if (!game) return 'Choose a game, then add its players.';
    const { name, minPlayers, maxPlayers } = game;
    if (seated < minPlayers)
        return `${name} takes ${minPlayers} players or more. Add ${minPlayers - seated} more.`;
    if (maxPlayers !== null && seated > maxPlayers)
        return `${name} takes ${maxPlayers} players or fewer. Remove ${seated - maxPlayers}.`;
    return null;
};
