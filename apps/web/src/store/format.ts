import type { ScoreInput } from '@gametabletally/scoring';

/**
 * What the app saves, and the one shape it is saved, backed up and handed on in.
 *
 * The same records sit in the phone's database and in an exported file, and a later sync or a
 * phone app in another language reads them too, so the shape is a contract with a version. It
 * is described in docs/saved-games.md, which changes with it.
 *
 * Totals are never saved. A game holds what was entered and the rule set it was played under,
 * and the scoring package works the scores out from that, every time.
 */

/** What an exported file names itself, so another kind of file is told apart at once. */
export const FORMAT = 'gametabletally';

/** The version of the saved shape this build writes, and the newest it reads. */
export const FORMAT_VERSION = 1;

/** Someone who plays. */
export interface SavedPlayer {
    /** The player's id, which games name them by. It never changes. */
    readonly id: string;
    /** What they are called, which can change. */
    readonly name: string;
    /** When they were added, as an ISO date and time. */
    readonly added: string;
    /**
     * Whether they were removed. A removed player is offered for no new game and is kept, so the
     * games they played still say who played.
     */
    readonly removed: boolean;
}

/** A game, in play or finished: what was entered, and nothing worked out from it. */
export interface SavedGame {
    readonly id: string;
    /** The game played, by the scoring package's id for it. */
    readonly game: string;
    /** The version of the game's rule set it is played under. */
    readonly rules: number;
    /** The options it was started with. */
    readonly options: Readonly<Record<string, unknown>>;
    /** The players' ids, in seat order. */
    readonly players: readonly string[];
    /** Every round entered, in order, in the shape the game's rules read. */
    readonly rounds: readonly unknown[];
    /** When it was started, as an ISO date and time. */
    readonly started: string;
    /** When it was last changed, as an ISO date and time. A merge keeps the later of two. */
    readonly changed: string;
}

/** Everything saved, as one file. */
export interface SavedFile {
    readonly format: typeof FORMAT;
    readonly version: number;
    /** When the file was written, as an ISO date and time. */
    readonly exported: string;
    readonly players: readonly SavedPlayer[];
    readonly games: readonly SavedGame[];
}

/** Why a file cannot be read, in a sentence a person can act on. */
export interface FileProblem {
    readonly code: 'not-a-file' | 'newer-format';
    readonly message: string;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** Reads a player as saved, or null when what is there is not a player. */
export const readPlayer = (raw: unknown): SavedPlayer | null => {
    if (!isRecord(raw)) return null;
    const { id, name, added, removed } = raw;
    if (!isText(id) || !isText(name) || !isText(added) || typeof removed !== 'boolean') return null;
    return { id, name, added, removed };
};

/** Reads a game as saved, or null when what is there is not a game. */
export const readGame = (raw: unknown): SavedGame | null => {
    if (!isRecord(raw)) return null;
    const { id, game, rules, options, players, rounds, started, changed } = raw;
    if (!isText(id) || !isText(game) || !isText(started) || !isText(changed)) return null;
    if (typeof rules !== 'number' || !Number.isSafeInteger(rules) || !isRecord(options))
        return null;
    if (!Array.isArray(players) || !Array.isArray(rounds)) return null;
    const ids = players.filter(isText);
    if (ids.length !== players.length) return null;
    return { id, game, rules, options, players: ids, rounds, started, changed };
};

const NOT_A_FILE: FileProblem = {
    code: 'not-a-file',
    message: 'This is not a file of saved games.',
};

/** Every record a list holds, read, or null when one of them is not what the list is of. */
const readAll = <Saved>(
    list: unknown,
    read: (raw: unknown) => Saved | null
): readonly Saved[] | null => {
    if (!Array.isArray(list)) return null;
    const saved = list.flatMap((raw: unknown) => read(raw) ?? []);
    return saved.length === list.length ? saved : null;
};

/**
 * Reads an exported file from its text, or says why it cannot be read.
 *
 * A file from a newer version of the saved shape is refused whole. Reading what this build
 * understands of it and dropping the rest would lose what the newer app saved, with nothing
 * said.
 */
export const readFile = (text: string): SavedFile | FileProblem => {
    let raw: unknown;
    try {
        raw = JSON.parse(text);
    } catch {
        return NOT_A_FILE;
    }
    if (!isRecord(raw) || raw['format'] !== FORMAT) return NOT_A_FILE;
    const { version, exported } = raw;
    if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1)
        return NOT_A_FILE;
    if (version > FORMAT_VERSION)
        return {
            code: 'newer-format',
            message:
                'This file was saved by a newer version of the app. Update the app, then open the file again.',
        };
    const players = readAll(raw['players'], readPlayer);
    const games = readAll(raw['games'], readGame);
    if (!isText(exported) || players === null || games === null) return NOT_A_FILE;
    return { format: FORMAT, version: FORMAT_VERSION, exported, players, games };
};

/** A saved game as the scoring package takes it. */
export const toScoreInput = ({ game, rules, options, players, rounds }: SavedGame): ScoreInput => ({
    game,
    rules,
    options,
    players,
    rounds,
});
