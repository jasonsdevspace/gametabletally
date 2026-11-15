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
export const restoredOf = ({ games, players }: Imported): string => {
    const parts = [
        ...(games > 0 ? [counted(games, 'game', 'games')] : []),
        ...(players > 0 ? [counted(players, 'player', 'players')] : []),
    ];
    return parts.length === 0
        ? 'Nothing was added. Every game and player in the file is already on this phone.'
        : `Restored ${parts.join(' and ')} from the file.`;
};

/**
 * What a save did, in a sentence. A page cannot tell whether the browser kept the file, which a
 * visitor can cancel, so it says the file is ready and where the browser puts it.
 */
export const savedOf = (games: number, name: string): string =>
    games === 0
        ? `${name} is ready, with no games on this phone yet. Your browser saves it with your downloads.`
        : `${counted(games, 'game is', 'games are')} ready in ${name}. Your browser saves it with your downloads.`;

/**
 * Whether the browser will keep the games when the phone runs low on space, in words: it agreed,
 * it has not, or it does not say.
 */
export const keptOf = (kept: boolean | null): string => {
    if (kept === true)
        return 'This browser has agreed to keep your games, even when the phone runs low on space.';
    if (kept === false)
        return 'This browser has not agreed to keep your games, so it might clear them when the phone runs low on space. Save them to a file to keep a copy.';
    return 'This browser does not say whether it will keep your games. Save them to a file to keep a copy.';
};

/** What a backup leaves out, when some of what is saved cannot be read, or nothing. */
export const damagedOf = (damaged: number): string =>
    damaged === 0
        ? ''
        : `${damaged === 1 ? 'One saved game or player' : `${String(damaged)} saved games or players`} cannot be read, so a file saved now will leave ${damaged === 1 ? 'it' : 'them'} out.`;
