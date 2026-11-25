import type { ScoreResult } from '@gametabletally/scoring';

import type { GameInPlay } from '../play/play.js';
import { compareInstants, type SavedGame } from '../store/format.js';
import { listOf } from '../website/games.js';
import { gameNameOf } from './in-play.js';
import { nameIn } from './opened-game.js';
import { playedWith } from './options.js';

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
    /**
     * The day it was started, written out in the visitor's form, with the time it was started where
     * another listed game was started the same day.
     */
    readonly date: string;
    /** The players, in seat order. */
    readonly players: string;
    /** The options it was played with that differ from the published rules, or nothing. */
    readonly rules: string;
}

/** How a date and a time are written, in the visitor's form unless a test gives its own. */
export interface DateFormats {
    readonly date: Intl.DateTimeFormat;
    readonly time: Intl.DateTimeFormat;
}

let visitor: DateFormats | null = null;

/** The visitor's own way of writing a date and a time, made once and kept. */
export const visitorFormats = (): DateFormats =>
    (visitor ??= {
        date: new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }),
        time: new Intl.DateTimeFormat(undefined, { timeStyle: 'short' }),
    });

/**
 * Who won, in a few words, alone or sharing the win, with the winning total, as the recap says it,
 * or that the rules named no one.
 */
export const wonBy = (winners: readonly string[], total: number): string => {
    if (winners.length === 0) return 'No winner';
    const named = listOf(winners, 'and');
    return winners.length === 1
        ? `${named} won with ${String(total)}`
        : `${named} shared the win, level on ${String(total)}`;
};

/**
 * Whether the rules have ended a game and no saved round of it is open to change, which would put
 * it back in play until it is saved or let go, as the start screen offers it then. It reads the
 * game as saved and the scoring package's answer for it, so a player's record counts the same
 * games the history lists.
 */
export const isFinished = ({
    result,
    saved,
}: {
    readonly result: ScoreResult;
    readonly saved: SavedGame;
}): boolean =>
    result.state === 'over' && (saved.draft === null || saved.draft.index >= saved.rounds.length);

/**
 * The newest first, by the moment each was started, which nothing done to a game later changes,
 * so a round changed in an old game or a game put back after a delete keeps its place.
 */
const startedLastFirst = (first: GameInPlay, second: GameInPlay): number =>
    compareInstants(second.saved.started, first.saved.started) ||
    first.saved.id.localeCompare(second.saved.id);

/**
 * Every finished game, the newest first, with who won and by what total, the game, the day it was
 * started in the form the formats write and the players' names. Two games started the same day
 * carry the time each was started too, so their rows read apart. A game in play is left out, since
 * the start screen offers it.
 */
export const finishedOf = (
    games: readonly GameInPlay[],
    names: ReadonlyMap<string, string>,
    formats: DateFormats
): FinishedGame[] => {
    const finished = games.filter(isFinished).sort(startedLastFirst);
    const days = finished.map(({ saved }) => formats.date.format(new Date(saved.started)));
    return finished.map(({ saved, result }, at) => {
        const day = days[at] ?? '';
        const shared = days.filter((one) => one === day).length > 1;
        const started = new Date(saved.started);
        return {
            id: saved.id,
            won: wonBy(
                result.winners.map((one) => nameIn(names, one)),
                result.totals[result.winners[0] ?? ''] ?? 0
            ),
            game: gameNameOf(saved.game),
            date: shared ? `${day}, ${formats.time.format(started)}` : day,
            players: listOf(
                saved.players.map((one) => nameIn(names, one)),
                'and'
            ),
            rules: playedWith(saved),
        };
    });
};
