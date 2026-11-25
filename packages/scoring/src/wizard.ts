import {
    bestAmong,
    contenders,
    declare,
    isOn,
    isRecord,
    isWhole,
    problemAt,
    readEntries,
    type Refusal,
    refusal,
    type RoundContext,
    type RoundOutcome,
    type Rules,
    type Standing,
} from './rules.js';
import type { SwitchOption } from './types.js';

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
     * The ids of the players out of the round. A bid one of them made before they left, with no
     * tricks, is passed over, since a bid with no tricks behind it is nobody's score.
     */
    readonly out?: readonly string[] | null;
}

/** What a met bid scores before its tricks, and what each trick is worth. */
const MET = 20;
const PER_TRICK = 10;
/** The cards in the deck, which the last round deals out between the players. */
const DECK = 60;

/**
 * The published variant Plus or minus one, off by the published rules: the bids of a round may not
 * add up to the cards dealt to each player, so at least one player misses.
 */
const PLUS_MINUS_ONE: SwitchOption = {
    kind: 'switch',
    id: 'plus-minus-one',
    name: 'Plus or minus one',
    description:
        'The bids may not add up to the cards dealt to each player, so somebody misses their bid.',
    default: false,
};

/**
 * How many rounds a game of Wizard lasts for a number of players: the deck dealt out between them
 * in the last round.
 */
export const wizardRounds = (players: number): number => DECK / players;

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
 * null while only the bid is, or why it is refused.
 */
const readPlayer =
    (dealt: number) =>
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
        return scoreBid(bid, tricks);
    };

/**
 * The round's entries with the bid of each player out of it passed over: an entry that would be
 * accepted as a bid with no tricks, which is one made before the player left. Any other entry for
 * a player out is left in and refused, since nobody out of a round played its hand.
 */
const withoutBidsOfThoseOut = (round: unknown, out: readonly string[], dealt: number): unknown => {
    if (!isRecord(round) || !isRecord(round['entries'])) return round;
    const { entries } = round;
    const left = Object.entries(entries).filter(
        ([id, entry]) => !out.includes(id) || readPlayer(dealt)(entry) !== null
    );
    return { ...round, entries: Object.fromEntries(left) };
};

/** The tricks the players in a round have given so far, added up. */
const tricksGiven = (round: unknown, players: readonly string[]): number => {
    const entries = isRecord(round) && isRecord(round['entries']) ? round['entries'] : {};
    return players.reduce((sum, player) => {
        const entry = Object.prototype.hasOwnProperty.call(entries, player)
            ? entries[player]
            : undefined;
        const tricks = isRecord(entry) ? entry['tricks'] : undefined;
        return sum + (isWhole(tricks) ? tricks : 0);
    }, 0);
};

/**
 * The bids of the players in a round added up, once each of them has bid, or null while a bid is
 * still to come. Read only from a round whose entries are accepted, so every entry holds a bid.
 */
const bidsMade = (round: unknown, players: readonly string[]): number | null => {
    const entries = isRecord(round) && isRecord(round['entries']) ? round['entries'] : {};
    const bids = players.map((player) => {
        const entry = Object.prototype.hasOwnProperty.call(entries, player)
            ? entries[player]
            : undefined;
        const bid = isRecord(entry) ? entry['bid'] : undefined;
        return isWhole(bid) ? bid : null;
    });
    return bids.every((bid) => bid !== null) ? bids.reduce((sum, bid) => sum + bid, 0) : null;
};

const scoreRound = (round: unknown, context: RoundContext): RoundOutcome => {
    // The first round deals one card, and each round after one more, whoever plays it.
    const dealt = context.index + 1;
    const read = withoutBidsOfThoseOut(round, context.out, dealt);
    const { scores, problems, allIn } = readEntries(read, context, readPlayer(dealt));
    if (problems.length > 0) return { scores, problems, complete: false };
    // Under Plus or minus one, the last bid cannot make the bids come to the cards dealt, so a
    // round whose bids do is refused, whatever its tricks.
    if (isOn(context.options, PLUS_MINUS_ONE) && bidsMade(read, context.players) === dealt)
        return {
            scores,
            complete: false,
            problems: [
                problemAt(
                    refusal(
                        'bid-total',
                        `The bids come to ${dealt}, the cards dealt to each player, and the options say they may not.`,
                        { dealt }
                    ),
                    context.index
                ),
            ],
        };
    // Once every player in the round has played the hand, between them they took every trick. Before
    // then, tricks that already come to more than were dealt can never be right.
    const given = tricksGiven(read, context.players);
    if (allIn ? given !== dealt : given > dealt)
        return {
            scores,
            complete: false,
            problems: [
                problemAt(
                    refusal(
                        'trick-total',
                        `The tricks taken come to ${given}, and the round dealt ${dealt} ${dealt === 1 ? 'card' : 'cards'} to each player.`,
                        { dealt, given }
                    ),
                    context.index
                ),
            ],
        };
    return { scores, problems, complete: allIn };
};

/**
 * After the last round, the highest total among the players who have missed no round, or among
 * everyone when every player has missed one.
 */
const winners = ({ totals, missed, rounds }: Standing): readonly number[] | null => {
    // The game takes three to six players, and each of those counts divides the deck exactly.
    if (rounds < wizardRounds(totals.length)) return null;
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
    options: declare(PLUS_MINUS_ONE),
    scoreRound,
    winners,
};
