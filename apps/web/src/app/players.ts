import type { SavedGame, SavedPlayer } from '../store/format.js';
import { type Store, withStore } from '../store/store.js';
import { playerNamed, sameName } from './seats.js';

/**
 * The players screen and a player's own page: who is saved, how many games each has played, and
 * the words for a name the app refuses.
 */

/** The players as the two screens read them, with how many games each has played. */
export interface PlayersRead {
    /** Every player, the removed ones among them, in the order they were added. */
    readonly players: readonly SavedPlayer[];
    readonly played: ReadonlyMap<string, number>;
    /** Every saved game, in play or finished, which a player's record is worked out from. */
    readonly games: readonly SavedGame[];
}

/** How many games each player has played, by id. */
export const playedOf = (games: readonly SavedGame[]): ReadonlyMap<string, number> => {
    const played = new Map<string, number>();
    for (const game of games)
        for (const id of new Set(game.players)) played.set(id, (played.get(id) ?? 0) + 1);
    return played;
};

/** Reads the players and their games from the phone's database, and lets the database go. */
export const readPlayers = (open: () => Promise<Store>): Promise<PlayersRead> =>
    withStore(open, async (store) => {
        const [players, games] = await Promise.all([store.players(), store.games()]);
        return { players, played: playedOf(games), games };
    });

/** How many games a player has played, in words. */
export const gamesOf = (count: number): string => {
    if (count === 0) return 'No games yet';
    return count === 1 ? '1 game' : `${String(count)} games`;
};

/**
 * Why a name cannot be a player's, or null when it can: one that is empty, or one another player
 * still offered already has. `self` is the player being renamed, whose own name is no clash.
 */
export const nameRefusal = (
    players: readonly SavedPlayer[],
    name: string,
    self?: string
): string | null => {
    if (name === '') return "Enter the player's name.";
    const taken = players.find(
        (player) => player.id !== self && !player.removed && sameName(player.name, name)
    );
    return taken ? `A player is already named ${taken.name}.` : null;
};

/**
 * The player a new name makes: a removed player of that name brought back, so their games and the
 * new ones are one player's, or a new player.
 */
export const newPlayerOf = (
    players: readonly SavedPlayer[],
    name: string,
    id: string,
    added: Date
): SavedPlayer => {
    const known = playerNamed(players, name);
    return known?.removed
        ? { ...known, removed: false }
        : { id, name, added: added.toISOString(), removed: false };
};

/** What the players list listens for, so a player put back from a toast is listed again. */
export const PLAYERS_CHANGED = 'gtt-players-changed';

/** Says the saved players changed outside the screen showing them. */
export const playersChanged = (): void => {
    window.dispatchEvent(new Event(PLAYERS_CHANGED));
};
