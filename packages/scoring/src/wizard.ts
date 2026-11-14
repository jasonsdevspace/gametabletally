import {
    bestAmong,
    contenders,
    isRecord,
    isWhole,
    noOptions,
    problemAt,
    readEntries,
    type Refusal,
    refusal,
    type RoundContext,
    type RoundOutcome,
    type Rules,
    type Standing,
} from './rules.js';

/**
 * Wizard, as published. Each round deals one card more than the round before, starting from one,
 * and each player bids how many tricks they will take before the hand is played. A bid met exactly
 * scores twenty and ten for each trick taken, and a bid missed loses ten for each trick over or
 * under. The game is for three to six players and lasts sixty rounds divided by how many play,
 * which uses the whole deck in the last round. It is over after that round, and the highest total
 * of the players who have missed no round wins, shared by players level on it.
 *
 * A round is dealt by its number whoever plays it, and the game keeps the number of rounds it
 * started with, so a player out of a round changes neither. The tricks of the players in a round
 * add up to the cards each was dealt. Which card takes a trick is settled at the table, so an
 * entry holds only the bid and the tricks taken.
 */

/** What a player bid, and once the hand is played, the tricks they took. */
export interface WizardEntry {
    /** How many tricks the player bid to take, from zero to the cards dealt. */
    readonly bid: number;
    /** How many tricks the player took. It is left out, or null, until the hand is played. */
    readonly tricks?: number | null;
}

/** A round as entered: each player's entry by player id. A player with none has yet to bid. */
export interface WizardRound {
    readonly entries: Readonly<Record<string, WizardEntry>>;
    /**
     * The ids of the players out of the round. An entry one of them holds with no tricks is passed
     * over, since it is at most a bid made before they left, and a bid with no tricks behind it is
     * nobody's score.
     */
    readonly out?: readonly string[] | null;
}

/** What a met bid scores before its tricks, and what each trick is worth. */
const MET = 20;
const PER_TRICK = 10;
/** The cards in the deck, which the last round deals out between the players. */
const DECK = 60;

/** What a bid comes to once its tricks are known. */
const scoreBid = (bid: number, tricks: number): number =>
    bid === tricks ? MET + PER_TRICK * tricks : -PER_TRICK * Math.abs(bid - tricks);

/** A count a round can hold: a whole number from zero to the cards dealt. */
const outOfRange = (
    code: 'impossible-bid' | 'impossible-tricks',
    what: string,
    given: number,
    dealt: number
): Refusal =>
    refusal(code, `A player ${what} no fewer than 0 tricks and no more than ${dealt}.`, {
        min: 0,
        max: dealt,
        given,
    });

/**
 * One player's entry read and checked against the cards dealt: its score once the tricks are in,
 * null while only the bid is, or why it is refused. Each trick count accepted is handed to
 * `taken`, so the round can add them up.
 */
const readPlayer =
    (dealt: number, taken: (tricks: number) => void) =>
    (raw: unknown): number | Refusal | null => {
        if (!isRecord(raw)) return refusal('not-an-entry', 'The entry is not an object.', {});
        // A part given as null is a part not given, since a caller in another language writes
        // what it leaves out that way.
        const bid = raw['bid'] ?? undefined;
        const tricks = raw['tricks'] ?? undefined;
        if (!isWhole(bid))
            return refusal('not-an-entry', 'The entry does not give a bid as a whole number.', {
                part: 'bid',
            });
        if (bid < 0 || bid > dealt) return outOfRange('impossible-bid', 'bids', bid, dealt);
        if (tricks === undefined) return null;
        if (!isWhole(tricks))
            return refusal(
                'not-an-entry',
                'The entry does not give its tricks as a whole number.',
                {
                    part: 'tricks',
                }
            );
        if (tricks < 0 || tricks > dealt)
            return outOfRange('impossible-tricks', 'takes', tricks, dealt);
        taken(tricks);
        // A zero written with a minus sign is zero, here and once the answer is written as JSON.
        return scoreBid(bid, tricks) || 0;
    };

/**
 * The round with every entry of a player out of it that holds no tricks passed over, since such an
 * entry is at most a bid made before the player left. One that holds tricks, or is not an object,
 * is left in and refused, since nobody out of a round played its hand.
 */
const withoutBidsOfThoseOut = (round: unknown, out: readonly string[]): unknown => {
    if (!isRecord(round) || !isRecord(round['entries'])) return round;
    const { entries } = round;
    const left = Object.entries(entries).filter(
        ([id, entry]) => !out.includes(id) || !isRecord(entry) || (entry['tricks'] ?? null) !== null
    );
    return { ...round, entries: Object.fromEntries(left) };
};

const scoreRound = (round: unknown, context: RoundContext): RoundOutcome => {
    // The first round deals one card, and each round after one more, whoever plays it.
    const dealt = context.index + 1;
    const tricks: number[] = [];
    const { scores, problems, allIn } = readEntries(
        withoutBidsOfThoseOut(round, context.out),
        context,
        readPlayer(dealt, (taken) => tricks.push(taken))
    );
    if (problems.length > 0 || !allIn) return { scores, problems, complete: false };
    // Every player in the round has played the hand, so between them they took every trick.
    const given = tricks.reduce((sum, taken) => sum + taken, 0);
    if (given !== dealt)
        return {
            scores,
            complete: false,
            problems: [
                problemAt(
                    refusal(
                        'trick-total',
                        `The tricks taken come to ${given}, and the round dealt ${dealt} cards to each player.`,
                        { dealt, given }
                    ),
                    context.index
                ),
            ],
        };
    return { scores, problems, complete: true };
};

/**
 * After the last round, the highest total among the players who have missed no round, or among
 * everyone when every player has missed one.
 */
const winners = ({ totals, missed, rounds }: Standing): readonly number[] | null => {
    // The game takes three to six players, and each of those counts divides the deck exactly.
    if (rounds < DECK / totals.length) return null;
    // Players level on the highest total share the win.
    return bestAmong(totals, contenders(missed), 'highest');
};

export const WIZARD: Rules = {
    id: 'wizard',
    name: 'Wizard',
    rules: 1,
    ahead: 'highest',
    minPlayers: 3,
    maxPlayers: 6,
    // The published rules are the only ones this version knows.
    checkOptions: noOptions('Wizard'),
    scoreRound,
    winners,
};
