import type { Game, Problem } from './types.js';

/** What a game's rules are told about the round they are reading. */
export interface RoundContext {
    /** The players' ids in seat order. */
    readonly players: readonly string[];
    /** The round's place in the game, counted from zero. */
    readonly index: number;
}

/** A round as a game's rules read it. */
export interface RoundOutcome {
    /** The score of each player whose entry the rules accept. */
    readonly scores: ReadonlyMap<string, number>;
    /** What the rules refused in the round. */
    readonly problems: readonly Problem[];
}

/**
 * One game's rules. The scorer walks the rounds and keeps the totals, and asks the game only
 * what is its own: what a round holds, what it scores, and when the game has ended.
 */
export interface Rules extends Game {
    /** Whether the highest or the lowest total is ahead. */
    readonly ahead: 'highest' | 'lowest';
    /** What is wrong with the options, if anything. */
    readonly checkOptions: (options: Readonly<Record<string, unknown>>) => readonly Problem[];
    /** Reads one round as entered. */
    readonly scoreRound: (round: unknown, context: RoundContext) => RoundOutcome;
    /**
     * Who has won, as places in the seat order, given each player's total after a scored round,
     * or null while the game goes on.
     */
    readonly winners: (totals: readonly number[]) => readonly number[] | null;
}

/** Whether a value is an object with named fields, which is what JSON calls an object. */
export const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Whether a value is a whole number every runtime holds exactly. The package works in nothing
 * else, so a total is the same wherever it is added up.
 */
export const isWhole = (value: unknown): value is number =>
    typeof value === 'number' && Number.isSafeInteger(value);

/** Why something is refused, before it is placed: its code, its sentence and what it is about. */
export type Refusal = Pick<Problem, 'code' | 'message' | 'data'>;

/** A refusal, with nothing to add unless its data is given. */
export const refusal = (
    code: string,
    message: string,
    data: Readonly<Record<string, unknown>> = {}
): Refusal => ({ code, message, data });

/** A refusal placed in the game: at a round, about a player, or about the game as a whole. */
export const problemAt = (
    { code, message, data }: Refusal,
    round: number | null = null,
    player: string | null = null
): Problem => ({ code, message, data, round, player });

/**
 * A value as a problem's data holds it and its sentence shows it: text, a whole or a fractional
 * number, or true or false as given, and null for anything else, such as a card that is not
 * there. So what a problem carries always survives being written as JSON, whatever was entered.
 */
export const plain = (value: unknown): string | number | boolean | null =>
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
        ? value
        : null;
