import type { Imported } from '../store/store.js';

/**
 * The words the about page says about the games saved on the phone: the backup file's name, what
 * a restore did, whether the browser will keep the games, and what a backup leaves out.
 */

const twoDigits = (value: number) => String(value).padStart(2, '0');

/**
 * The backup file's name, with the day it was saved on the phone's own calendar, so a file saved
 * late in the evening is named for that evening.
 */
export const fileNameOf = (when: Date): string =>
    `game-table-tally-${String(when.getFullYear())}-${twoDigits(when.getMonth() + 1)}-${twoDigits(when.getDate())}.json`;

const counted = (count: number, one: string, many: string) =>
    `${String(count)} ${count === 1 ? one : many}`;

/** What a restore did, in a sentence. A game the phone held an older copy of counts as restored. */
export const restoredOf = ({ games, players }: Imported): string =>
    games === 0 && players === 0
        ? 'Nothing was added. This phone already holds everything in the file.'
        : `Restored ${counted(games, 'game', 'games')} and ${counted(players, 'player', 'players')} from the file.`;

/** What a save did, in a sentence. */
export const savedOf = (games: number, name: string): string =>
    `Saved ${counted(games, 'game', 'games')} to ${name}.`;

/**
 * Whether the browser will keep the games when the phone runs low on space, in words: it agreed,
 * it has not, or it does not say.
 */
export const keptOf = (kept: boolean | null): string => {
    if (kept === true)
        return 'This browser has agreed to keep your games, even when the phone runs low on space.';
    if (kept === false)
        return 'This browser has not agreed to keep your games, so it may clear them when the phone runs low on space. Saving them to a file keeps a copy.';
    return 'This browser does not say whether it will keep your games. Saving them to a file keeps a copy.';
};

/** What a backup leaves out, when some of what is saved cannot be read, or nothing. */
export const damagedOf = (damaged: number): string =>
    damaged === 0
        ? ''
        : `${damaged === 1 ? 'One saved record' : `${String(damaged)} saved records`} cannot be read, so a file saved now will not hold ${damaged === 1 ? 'it' : 'them'}.`;
