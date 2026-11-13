import type { Game, OneProblem, Plain, Problem, ProblemCode, ProblemData } from './types.js';

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
    /**
     * Whether everything the round needs is in. A game says so for itself, since a round can
     * need more than an entry from each player, such as who ended it.
     */
    readonly complete: boolean;
}

/**
 * One game's rules. The scorer walks the rounds and keeps the totals, and asks the game only
 * what is its own: what a round holds, what it scores, and when the game has ended.
 */
export interface Rules extends Game {
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

/** Every field any of a union's members has. */
type FieldsOf<Type> = Type extends unknown ? keyof Type : never;

/**
 * Nothing but the fields a code's data may have, so data given with a field of its own fails,
 * as it would not against a code that carries nothing, whose type an object of any fields fits.
 */
type Only<Data, Allowed> = { readonly [Field in Exclude<keyof Data, FieldsOf<Allowed>>]: never };

/** Why something is refused for one code, before it is placed. */
export type RefusalOf<Code extends ProblemCode> = Pick<
    OneProblem<Code>,
    'code' | 'message' | 'data'
>;

/** Why something is refused, before it is placed: its code, its sentence and what it is about. */
export type Refusal = { [Code in ProblemCode]: RefusalOf<Code> }[ProblemCode];

/**
 * A refusal, with its code's own data, empty where the code carries nothing, so a code raised with
 * data that is not its own fails the type check.
 */
export const refusal = <Code extends ProblemCode, Data extends ProblemData[Code]>(
    code: Code,
    message: string,
    data: Data & Only<Data, ProblemData[Code]>
): RefusalOf<Code> => ({ code, message, data });

/** A refusal placed in the game: at a round, about a player, or about the game as a whole. */
export const problemAt = (
    refused: Refusal,
    round: number | null = null,
    player: string | null = null
): Problem => ({ ...refused, round, player });

/**
 * A value as a problem's data holds it and its sentence shows it: text, a whole or a fractional
 * number, or true or false as given, and null for anything else, such as a card that is not
 * there. So what a problem carries always survives being written as JSON, whatever was entered.
 */
export const plain = (value: unknown): Plain =>
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
        ? value
        : null;

/** A round's entries, read: the round itself when it holds them, the scores and the refusals. */
export interface Entered {
    /** The round as entered, or null when it does not hold its entries. */
    readonly round: Readonly<Record<string, unknown>> | null;
    readonly scores: Map<string, number>;
    readonly problems: Problem[];
    /**
     * Whether every player has an entry the rules accept. A round is complete when this is so
     * and the game has whatever else it needs, and never while it is not, so no player is
     * scored for an entry they have yet to make.
     */
    readonly allIn: boolean;
}

/**
 * Reads a round that holds each player's entry by player id, which is how every game here
 * enters a round. An entry for nobody in the game is refused first, sorted by id, since the
 * order an object's keys come in is one runtime's own. The players' entries follow in seat
 * order, each read by the game, and a player with none has yet to play.
 */
export const readEntries = (
    round: unknown,
    { players, index }: RoundContext,
    read: (entry: unknown) => number | Refusal
): Entered => {
    if (!isRecord(round) || !isRecord(round['entries']))
        return {
            round: null,
            scores: new Map(),
            problems: [
                problemAt(
                    refusal('not-a-round', 'The round does not hold its entries.', {}),
                    index
                ),
            ],
            allIn: false,
        };
    const { entries } = round;
    const scores = new Map<string, number>();
    const problems: Problem[] = Object.keys(entries)
        .filter((id) => !players.includes(id))
        .sort()
        .map((id) =>
            problemAt(
                refusal('unknown-player', 'The entry is for nobody in the game.', {}),
                index,
                id
            )
        );
    for (const player of players) {
        // Asked of the entries themselves, so an id such as `toString` is not found on every object.
        if (!Object.prototype.hasOwnProperty.call(entries, player)) continue;
        const answer = read(entries[player]);
        if (typeof answer === 'number') scores.set(player, answer);
        else problems.push(problemAt(answer, index, player));
    }
    return { round, scores, problems, allIn: players.every((player) => scores.has(player)) };
};

/**
 * The check of a game's options for a game that has none: each one given is refused by name.
 */
export const noOptions =
    (game: string) =>
    (options: Readonly<Record<string, unknown>>): readonly Problem[] =>
        Object.keys(options).map((option) =>
            problemAt(
                refusal(
                    'unknown-option',
                    `${game} has no option named ${JSON.stringify(option)}.`,
                    {
                        option,
                    }
                )
            )
        );
