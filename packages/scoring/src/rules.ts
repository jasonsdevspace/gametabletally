import type {
    Game,
    GameOption,
    OneProblem,
    OptionValue,
    Plain,
    Problem,
    ProblemCode,
    ProblemData,
} from './types.js';

/**
 * A game's options as it is played: the value of each it declares, by id, the published rule's
 * where the game was not given one.
 */
export type Settled = Readonly<Record<string, OptionValue>>;

/** What a game's rules are told about the round they are reading. */
export interface RoundContext {
    /** The ids of the players in the round, in seat order. Those out of it are not among them. */
    readonly players: readonly string[];
    /** The ids of the players out of the round, in seat order. */
    readonly out: readonly string[];
    /** The round's place in the game, counted from zero. */
    readonly index: number;
    /** The game's options, already checked, with the published rule's where none was given. */
    readonly options: Settled;
}

/** What a game's rules are told when asked whether the game is over. */
export interface Standing {
    /** Each player's total after the rounds scored, in seat order. */
    readonly totals: readonly number[];
    /** Whether each player has been out of a scored round, in seat order. */
    readonly missed: readonly boolean[];
    /** How many rounds have been scored. */
    readonly rounds: number;
    /** The game's options, already checked, with the published rule's where none was given. */
    readonly options: Settled;
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
    /** Reads one round as entered, for the players in it. */
    readonly scoreRound: (round: unknown, context: RoundContext) => RoundOutcome;
    /**
     * Who has won, as places in the seat order, after a scored round, or null while the game
     * goes on. A player who has missed a round may end the game and may not win it while
     * another player has missed none.
     */
    readonly winners: (standing: Standing) => readonly number[] | null;
}

/** The fewest players a round can be scored with, whatever the game takes to start. */
export const FEWEST_IN_ROUND = 2;

/**
 * The places, in seat order, of the players who can be ahead or win: those who have missed no
 * round, or everyone when every player has missed one, since such a game still has a leader.
 */
export const contenders = (missed: readonly boolean[]): number[] => {
    const seats = missed.map((_, seat) => seat);
    const played = seats.filter((seat) => missed[seat] !== true);
    return played.length > 0 ? played : seats;
};

/**
 * The places among those given whose total is the best, the highest or the lowest, in seat order.
 */
export const bestAmong = (
    totals: readonly number[],
    seats: readonly number[],
    ahead: Game['ahead']
): number[] => {
    const counted = seats.map((seat) => totals[seat] ?? 0);
    const best = ahead === 'highest' ? Math.max(...counted) : Math.min(...counted);
    return seats.filter((seat) => totals[seat] === best);
};

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
     * Whether every player has an entry the rules accept and score. A round is complete when
     * this is so and the game has whatever else it needs, and never while it is not, so no player
     * is scored for an entry they have yet to make.
     */
    readonly allIn: boolean;
}

/**
 * Reads a round that holds each player's entry by player id, which is how every game here
 * enters a round. An entry for a player out of the round is refused first, in seat order, then
 * one for nobody in the game, sorted by id, since the order an object's keys come in is one
 * runtime's own. The entries of the players in the round follow in seat order, each read by the
 * game, and a player with none has yet to play. The game reads an entry as its score, as why it
 * is refused, or as null when the entry is accepted and holds nothing to score yet, such as a bid
 * made before the hand is played. A player with such an entry has yet to play, as one with none has.
 */
export const readEntries = (
    round: unknown,
    { players, out, index }: RoundContext,
    read: (entry: unknown) => number | Refusal | null
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
    // Asked of the entries themselves, so an id such as `toString` is not found on every object.
    const has = (id: string): boolean => Object.prototype.hasOwnProperty.call(entries, id);
    const problems: Problem[] = [
        ...out
            .filter(has)
            .map((id) =>
                problemAt(
                    refusal('out-with-entry', 'The entry is for a player out of the round.', {}),
                    index,
                    id
                )
            ),
        ...Object.keys(entries)
            .filter((id) => !players.includes(id) && !out.includes(id))
            .sort()
            .map((id) =>
                problemAt(
                    refusal('unknown-player', 'The entry is for nobody in the game.', {}),
                    index,
                    id
                )
            ),
    ];
    for (const player of players) {
        if (!has(player)) continue;
        const answer = read(entries[player]);
        if (typeof answer === 'number') scores.set(player, answer);
        else if (answer !== null) problems.push(problemAt(answer, index, player));
    }
    return { round, scores, problems, allIn: players.every((player) => scores.has(player)) };
};

/** The number an option is set to in a game, or its default when it is not a number. */
export const numberOption = (options: Settled, option: GameOption): number => {
    const value = options[option.id];
    return typeof value === 'number' ? value : Number(option.default);
};

/** Whether an option that is on or off is on in a game. */
export const isOn = (options: Settled, option: GameOption): boolean => options[option.id] === true;
