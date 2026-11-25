/**
 * What goes in and what comes out. Every value here survives `JSON.stringify`, so an app in any
 * language can hand a game over as text and read the answer back the same way.
 */

/** A game as it stands: who is playing and everything entered so far. */
export interface ScoreInput {
    /** The game's id, as `GAMES` lists it. */
    readonly game: string;
    /** The version of the game's rule set the game is played under, as `GAMES` lists it. */
    readonly rules: number;
    /**
     * The options that change a rule, by their ids, as `GAMES` lists them for the game. An option
     * not given, or given as null, is played by the published rule, so a game played by the book
     * takes an empty object. The options hold for the whole game.
     */
    readonly options: Readonly<Record<string, unknown>>;
    /** The players' ids in seat order. An id is the caller's own and never appears in a message. */
    readonly players: readonly string[];
    /**
     * Every round so far, in order. What a round holds is the game's own, so each is checked as
     * it is read, and one that does not have the game's shape is refused with the reason. Any
     * round may also name, as `out`, the ids of the players who are out of it.
     */
    readonly rounds: readonly unknown[];
}

/**
 * A value a problem's data holds as it was entered: text, a whole or a fractional number, or true
 * or false, and null for anything else, such as a card that is not there.
 */
export type Plain = string | number | boolean | null;

/** A count given outside the least and the most it can be, with both. */
type Range = { readonly min: number; readonly max: number; readonly given: number };

/** What a problem carries where its code has nothing to add, so no field can be read from it. */
type Nothing = Readonly<Record<never, never>>;

/**
 * What each problem carries, by its code, as the README's table of codes has it. A field's
 * meaning is its code's own: `max` is a number of players under one code and of cards under
 * another.
 */
export interface ProblemData {
    readonly 'not-json': Nothing;
    /** The part a game lacks or has wrong, or nothing when it is not an object at all. */
    readonly 'not-a-game':
        Nothing | { readonly part: 'game' | 'rules' | 'options' | 'players' | 'rounds' };
    readonly 'unknown-game': { readonly game: string };
    readonly 'unknown-rules': { readonly rules: number };
    readonly 'too-few-players': { readonly min: number; readonly given: number };
    readonly 'too-many-players': { readonly max: number; readonly given: number };
    readonly 'player-twice': Nothing;
    readonly 'unknown-option': { readonly option: string };
    readonly 'value-not-allowed': { readonly option: string; readonly value: Plain };
    /**
     * `out` when the round's list of players out is not a list of ids, or nothing when the round
     * does not hold its entries.
     */
    readonly 'not-a-round': Nothing | { readonly part: 'out' };
    readonly 'unknown-out': Nothing;
    readonly 'out-twice': Nothing;
    readonly 'out-with-entry': Nothing;
    readonly 'too-few-in-round': { readonly min: number; readonly given: number };
    readonly 'ender-out': Nothing;
    readonly 'round-unfinished': Nothing;
    readonly 'no-ender': Nothing;
    readonly 'unknown-ender': { readonly ender: Plain };
    readonly 'after-a-gap': Nothing;
    readonly 'after-the-end': Nothing;
    readonly 'unknown-player': Nothing;
    /** The part of an entry at fault, or nothing when it is not an object at all. */
    readonly 'not-an-entry':
        | Nothing
        | {
              readonly part:
                  'bust' | 'numbers' | 'modifiers' | 'total' | 'cards' | 'both' | 'bid' | 'tricks';
          };
    /** The card as given, and in Flip 7 the list it was in. */
    readonly 'unknown-card': { readonly card: Plain; readonly kind?: 'number' | 'modifier' };
    readonly 'number-twice': { readonly number: number };
    readonly 'modifier-twice': { readonly modifier: string };
    readonly 'too-many-cards': { readonly max: number; readonly given: number };
    readonly 'too-many-copies': {
        readonly card: number;
        readonly max: number;
        readonly given: number;
    };
    readonly 'impossible-total': Range;
    readonly 'too-many-numbers': { readonly max: number; readonly given: number };
    readonly 'impossible-bid': Range;
    readonly 'impossible-tricks': Range;
    readonly 'trick-total': { readonly dealt: number; readonly given: number };
    readonly 'bid-total': { readonly dealt: number };
}

/** A name for a reason something is refused, one of those the README's table lists. */
export type ProblemCode = keyof ProblemData;

/** Why something entered was refused, and where, for one code. */
export interface OneProblem<Code extends ProblemCode> {
    /** A name for the reason that never changes, for a caller that words the reason itself. */
    readonly code: Code;
    /** The reason in a plain sentence. It is this package's own wording and may change. */
    readonly message: string;
    /**
     * What the problem is about, for a caller that words the reason itself: the card refused,
     * the number of players a game takes. Its fields are its code's, and it is empty, never
     * missing, where the code has nothing to add. It holds only text, numbers, true or false and
     * null, whatever was entered.
     */
    readonly data: ProblemData[Code];
    /** The round it is in, counted from zero, or null when it is about the game as a whole. */
    readonly round: number | null;
    /** The player it is about, or null when it is about the round or the game. */
    readonly player: string | null;
}

/**
 * Why something entered was refused, and where. Narrowing on its code gives its data's fields. A
 * caller that meets a code it does not know, from a newer package, words it by the sentence it
 * kept from before it narrowed.
 */
export type Problem = { [Code in ProblemCode]: OneProblem<Code> }[ProblemCode];

/**
 * A problem of the code given, or of any of the codes given, each still holding its own code's
 * data, so narrowing on its code gives that code's fields.
 */
export type ProblemOf<Code extends ProblemCode> = Extract<Problem, { readonly code: Code }>;

/** One round as the rules read it. */
export interface RoundResult {
    /**
     * `scored` once the round is whole: the entry of every player in it is in and accepted, with
     * whatever else the game needs of a round, such as who ended it. `open` while entries are
     * missing. `refused` when something in the round itself was turned down, which includes a round
     * every player has entered that still lacks what the game needs. `skipped` when the round was
     * never read, for a reason outside it: an earlier round has yet to be scored, the game was
     * already over, or the game as a whole was refused.
     */
    readonly state: 'scored' | 'open' | 'refused' | 'skipped';
    /**
     * The round's score for each player whose entry the rules accept, by player id. In a round
     * that is not yet scored these are what stands so far, and they count toward no total.
     */
    readonly scores: Readonly<Record<string, number>>;
    /**
     * The players out of the round who are in the game, in seat order. Empty for a round that was
     * never read, or whose list of players out is not a list of ids.
     */
    readonly out: readonly string[];
}

/** The game as the rules read it. */
export interface ScoreResult {
    readonly game: string;
    /** The version of the rule set the scores were worked out under. */
    readonly rules: number;
    /** `over` once the rules say the game has ended. */
    readonly state: 'in-play' | 'over';
    /** One result for each round entered, in order. */
    readonly rounds: readonly RoundResult[];
    /** Each player's total over the scored rounds, by player id. */
    readonly totals: Readonly<Record<string, number>>;
    /**
     * Whoever is ahead on the totals, in seat order, among the players who have missed no scored
     * round, or among everyone when every player has missed one. Every player, before a round is
     * scored.
     */
    readonly leaders: readonly string[];
    /** Whoever won, in seat order, once the game is over. Empty until then. */
    readonly winners: readonly string[];
    /**
     * Everyone who has been out of a scored round, in seat order. None of them can win while
     * another player has missed none.
     */
    readonly missed: readonly string[];
    /** Everything the rules refused, in the order it was met. */
    readonly problems: readonly Problem[];
}

/** A value an option can take: a number, such as a target score, or on and off. */
export type OptionValue = number | boolean;

/** What every option has, whatever its kind. */
interface OptionBase {
    /** What a game's options name it by. It never changes within a version of a rule set. */
    readonly id: string;
    /** What a player calls it, in the package's English. Not part of the contract. */
    readonly name: string;
    /** What it changes, in a plain sentence in the package's English. Not part of the contract. */
    readonly description: string;
}

/** An option that takes one of a list of whole numbers, such as a target score. */
export interface NumberOption extends OptionBase {
    readonly kind: 'number';
    /** The value of the published rule, which a game not given the option is played by. */
    readonly default: number;
    /** Every value it can take, the default among them, in the order an app offers them. */
    readonly values: readonly number[];
}

/** An option that is on or off. */
export interface SwitchOption extends OptionBase {
    readonly kind: 'switch';
    /** Whether the published rule has it on, which a game not given the option is played by. */
    readonly default: boolean;
}

/**
 * A rule a table may change for a game, as an app offers it. Narrowing on its kind gives its
 * default's type and, for a number, its values. The game's published rule is its default, so a game
 * given no options is played by the book.
 */
export type GameOption = NumberOption | SwitchOption;

/** A game the package knows, as an app lists it. */
export interface Game {
    /** What a saved game names it by. It never changes once a game has been saved under it. */
    readonly id: string;
    /** What a player calls it. Kept as data, so a name can change with no change to the code. */
    readonly name: string;
    /** The newest version of its rule set, which a new game is started under. */
    readonly rules: number;
    /**
     * Whether the highest or the lowest total is ahead, so a table of scores ranks every place
     * the right way round.
     */
    readonly ahead: 'highest' | 'lowest';
    /** The fewest players it takes. */
    readonly minPlayers: number;
    /** The most players it takes, or null when the rules name no limit. */
    readonly maxPlayers: number | null;
    /** The rules a table may change for it, in the order an app offers them. */
    readonly options: readonly GameOption[];
}
