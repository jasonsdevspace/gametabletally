import {
    isRecord,
    isWhole,
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
 * are added up here.
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
/** What a full grid of the lowest and of the highest card comes to. */
const LOWEST_TOTAL = MOST_CARDS * LOWEST_CARD;
const HIGHEST_TOTAL = MOST_CARDS * HIGHEST_CARD;
const TARGET = 100;

const isCard = (value: unknown): value is number =>
    isWhole(value) && value >= LOWEST_CARD && value <= HIGHEST_CARD;

/** The cards an entry lists, added up, or why they are refused. */
const readCards = (cards: readonly unknown[]): number | Refusal => {
    // Found by place, so a card that is itself undefined is refused like any other.
    const unknown = cards.findIndex((card) => !isCard(card));
    if (unknown !== -1)
        return refusal(
            'unknown-card',
            `The deck holds no card ${JSON.stringify(plain(cards[unknown]))}.`,
            { card: plain(cards[unknown]) }
        );
    if (cards.length > MOST_CARDS)
        return refusal('too-many-cards', `A hand holds ${MOST_CARDS} cards at most.`, {
            max: MOST_CARDS,
            given: cards.length,
        });
    return cards.filter(isCard).reduce((sum, card) => sum + card, 0);
};

/** One player's entry read and checked: what they hold, or why it is refused. */
const readPlayer = (raw: unknown): number | Refusal => {
    if (!isRecord(raw)) return refusal('not-an-entry', 'The entry is not an object.');
    const { total, cards } = raw;
    if (total !== undefined && cards !== undefined)
        return refusal('not-an-entry', 'The entry gives a total and its cards, and takes one.', {
            part: 'total',
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
    return total;
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
    const { scores, problems } = entered;
    const ender = entered.round?.['ender'] ?? null;
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
    const allIn = players.every((player) => scores.has(player));
    if (problems.length > 0 || !allIn) return { scores, problems, complete: false };
    // Every player has counted, so the round has ended, and it has to say who ended it. Until
    // it does, what each holds stands and nothing is scored.
    if (ender === null)
        return {
            scores,
            complete: false,
            problems: [
                problemAt(refusal('no-ender', 'The round does not say who ended it.'), index),
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
    checkOptions: (options) =>
        Object.keys(options).map((option) =>
            problemAt(
                refusal('unknown-option', `Skyjo has no option named ${JSON.stringify(option)}.`, {
                    option,
                })
            )
        ),
    scoreRound,
    winners,
};
