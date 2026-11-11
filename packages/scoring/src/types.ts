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
    /** The options that change a rule, by name. A game with none takes an empty object. */
    readonly options: Readonly<Record<string, unknown>>;
    /** The players' ids in seat order. An id is the caller's own and never appears in a message. */
    readonly players: readonly string[];
    /**
     * Every round so far, in order. What a round holds is the game's own, so each is checked as
     * it is read, and one that does not have the game's shape is refused with the reason.
     */
    readonly rounds: readonly unknown[];
}

/** Why something entered was refused, and where. */
export interface Problem {
    /** A name for the reason that never changes, for a caller that words the reason itself. */
    readonly code: string;
    /** The reason in a plain sentence. */
    readonly message: string;
    /** The round it is in, counted from zero, or null when it is about the game as a whole. */
    readonly round: number | null;
    /** The player it is about, or null when it is about the round or the game. */
    readonly player: string | null;
}

/** One round as the rules read it. */
export interface RoundResult {
    /**
     * `scored` once every player's entry is in and the rules accept each. `open` while entries
     * are missing. `refused` when the rules turned something in it down.
     */
    readonly state: 'scored' | 'open' | 'refused';
    /**
     * The round's score for each player whose entry the rules accept, by player id. In a round
     * that is not yet scored these are what stands so far, and they count toward no total.
     */
    readonly scores: Readonly<Record<string, number>>;
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
    /** Whoever is ahead on the totals, in seat order. Every player, before a round is scored. */
    readonly leaders: readonly string[];
    /** Whoever won, in seat order, once the game is over. Empty until then. */
    readonly winners: readonly string[];
    /** Everything the rules refused, in the order it was met. */
    readonly problems: readonly Problem[];
}

/** A game the package knows, as an app lists it. */
export interface Game {
    /** What a saved game names it by. It never changes once a game has been saved under it. */
    readonly id: string;
    /** What a player calls it. Kept as data, so a name can change with no change to the code. */
    readonly name: string;
    /** The newest version of its rule set, which a new game is started under. */
    readonly rules: number;
    /** The fewest players it takes. */
    readonly minPlayers: number;
    /** The most players it takes, or null when the rules name no limit. */
    readonly maxPlayers: number | null;
}
