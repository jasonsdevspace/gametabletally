import {
    isRecord,
    isWhole,
    noOptions,
    plain,
    problemAt,
    readEntries,
    type Refusal,
    refusal,
    type RoundContext,
    type RoundOutcome,
    type Rules,
} from './rules.js';

/**
 * Skyjo, as published. A round ends when one player has turned every card face up, and each
 * player then counts what they hold: cards from minus two to twelve, in a grid of twelve that
 * loses a column whenever its three cards match. The player who ended the round has to hold the
 * lowest score of it alone. If another player holds as little or less, and their own score is
 * above zero, it is doubled. The game ends with the round in which a player reaches one hundred,
 * and the lowest total wins.
 *
 * Players count their own cards, and a cleared column leaves a hand with fewer of them, so an
 * entry is the total a player counted. It may be given as the cards themselves instead, which
 * are added up here and held to what the deck holds of each.
 */

/** What a player ended a round with: the total they counted, or the cards they hold. */
export type SkyjoEntry =
    | { readonly total: number }
    | {
          /** Each card's value, from minus two to twelve. */
          readonly cards: readonly number[];
      };

/** A round as entered: each player's entry by player id, and who ended it. */
export interface SkyjoRound {
    readonly entries: Readonly<Record<string, SkyjoEntry>>;
    /** The id of the player who ended the round. It is left out, or null, until that is known. */
    readonly ender?: string | null;
}

const LOWEST_CARD = -2;
const HIGHEST_CARD = 12;
/** A grid holds four columns of three, and never gains a card. */
const MOST_CARDS = 12;
const TARGET = 100;

/** How many of a card the deck holds: five of the lowest, ten of the next, fifteen zeros, ten of each other. */
const copiesOf = (card: number): number => {
    if (card === LOWEST_CARD) return 5;
    if (card === 0) return 15;
    return 10;
};

/**
 * The least and the most a hand can come to, from what the deck holds: its five lowest cards
 * beside seven of the next, and its ten highest beside two of the next. A total outside them is
 * one no hand was ever counted to, which a slip of the thumb is far likelier to have typed.
 */
const LOWEST_TOTAL = 5 * LOWEST_CARD + 7 * (LOWEST_CARD + 1);
const HIGHEST_TOTAL = 10 * HIGHEST_CARD + 2 * (HIGHEST_CARD - 1);

const isCard = (value: unknown): value is number =>
    isWhole(value) && value >= LOWEST_CARD && value <= HIGHEST_CARD;

/** The cards an entry lists, added up, or why they are refused. */
const readCards = (listed: readonly unknown[]): number | Refusal => {
    // Found by place, so a card that is itself undefined is refused like any other.
    const unknown = listed.findIndex((card) => !isCard(card));
    if (unknown !== -1)
        return refusal(
            'unknown-card',
            `The deck holds no card ${JSON.stringify(plain(listed[unknown]))}.`,
            { card: plain(listed[unknown]) }
        );
    const cards = listed.filter(isCard);
    if (cards.length > MOST_CARDS)
        return refusal('too-many-cards', `A hand holds ${MOST_CARDS} cards at most.`, {
            max: MOST_CARDS,
            given: cards.length,
        });
    const held = (card: number): number => cards.filter((other) => other === card).length;
    const over = cards.find((card) => held(card) > copiesOf(card));
    if (over !== undefined)
        return refusal(
            'too-many-copies',
            `The deck holds ${copiesOf(over)} of the card ${over}, and the hand lists more.`,
            { card: over, max: copiesOf(over), given: held(over) }
        );
    return cards.reduce((sum, card) => sum + card, 0);
};

/** One player's entry read and checked: what they hold, or why it is refused. */
const readPlayer = (raw: unknown): number | Refusal => {
    if (!isRecord(raw)) return refusal('not-an-entry', 'The entry is not an object.', {});
    // A part given as null is a part not given, as a round's ender is, since a caller in
    // another language writes what it leaves out that way.
    const total = raw['total'] ?? undefined;
    const cards = raw['cards'] ?? undefined;
    if (total !== undefined && cards !== undefined)
        return refusal('not-an-entry', 'The entry gives a total and its cards, and takes one.', {
            part: 'both',
        });
    if (Array.isArray(cards)) return readCards(cards);
    if (cards !== undefined)
        return refusal('not-an-entry', 'The entry does not list its cards.', { part: 'cards' });
    if (!isWhole(total))
        return refusal('not-an-entry', 'The entry does not give a total as a whole number.', {
            part: 'total',
        });
    if (total < LOWEST_TOTAL || total > HIGHEST_TOTAL)
        return refusal(
            'impossible-total',
            `A hand comes to no less than ${LOWEST_TOTAL} and no more than ${HIGHEST_TOTAL}.`,
            { min: LOWEST_TOTAL, max: HIGHEST_TOTAL, given: total }
        );
    // A zero written with a minus sign is zero, here and once the answer is written as JSON.
    return total === 0 ? 0 : total;
};

/**
 * What each player scores once the round's ender is known: what they hold, with the ender's
 * doubled when it is above zero and another player holds as little or less.
 */
const withPenalty = (held: ReadonlyMap<string, number>, ender: string): Map<string, number> => {
    const own = held.get(ender) ?? 0;
    const beaten = [...held].some(([player, score]) => player !== ender && score <= own);
    return new Map(held).set(ender, own > 0 && beaten ? own * 2 : own);
};

const scoreRound = (round: unknown, context: RoundContext): RoundOutcome => {
    const { players, index } = context;
    const entered = readEntries(round, context, readPlayer);
    const { scores, problems, allIn } = entered;
    const ender = entered.round?.['ender'] ?? null;
    // The entries' refusals come first, in their order, and the ender's after them.
    if (ender !== null && (typeof ender !== 'string' || !players.includes(ender)))
        return {
            scores,
            complete: false,
            problems: [
                ...problems,
                problemAt(
                    refusal('unknown-ender', 'The round was ended by nobody in the game.', {
                        ender: plain(ender),
                    }),
                    index
                ),
            ],
        };
    // What each holds stands undoubled until the round is whole: with an entry refused or a
    // player yet to count, who holds the least is not known.
    if (problems.length > 0 || !allIn) return { scores, problems, complete: false };
    // Every player has counted, so the round has ended, and it has to say who ended it.
    if (ender === null)
        return {
            scores,
            complete: false,
            problems: [
                problemAt(refusal('no-ender', 'The round does not say who ended it.', {}), index),
            ],
        };
    return { scores: withPenalty(scores, ender), problems, complete: true };
};

/** Everyone on the lowest total, once any player has reached the target. */
const winners = (totals: readonly number[]): readonly number[] | null => {
    if (Math.max(...totals) < TARGET) return null;
    const lowest = Math.min(...totals);
    // Players level on the lowest total share the win.
    return totals.flatMap((total, seat) => (total === lowest ? [seat] : []));
};

export const SKYJO: Rules = {
    id: 'skyjo',
    name: 'Skyjo',
    rules: 1,
    ahead: 'lowest',
    minPlayers: 2,
    maxPlayers: 8,
    // The published rules are the only ones this version knows.
    checkOptions: noOptions('Skyjo'),
    scoreRound,
    winners,
};
