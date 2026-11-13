import {
    isRecord,
    isWhole,
    noOptions,
    plain,
    readEntries,
    type Refusal,
    refusal,
    type RoundContext,
    type RoundOutcome,
    type Rules,
} from './rules.js';

/**
 * Flip 7, as published. A player ends a round holding number cards and modifier cards, or
 * having bust. The round's score is the number cards added up, doubled by the x2 card, plus each
 * plus card, plus fifteen for seven different numbers. Neither the plus cards nor the fifteen
 * are ever doubled. A bust scores nothing. The game ends with the round in which a player
 * reaches two hundred, and the highest total wins. A tie at the top does not end it.
 *
 * The deck also holds three action cards: Freeze, Flip Three and Second Chance. They change who
 * plays on and whether a repeated number is a bust, and never what a hand is worth, so an entry
 * leaves them out. It holds what the player ended the round with that scores, and one naming an
 * action card is refused like any card the entry has no place for.
 */

/** The cards that change a score without being a number. The deck holds one of each. */
export const FLIP_7_MODIFIERS = ['+2', '+4', '+6', '+8', '+10', 'x2'] as const;

/** One of the modifier cards, as an entry names it. */
export type Flip7Modifier = (typeof FLIP_7_MODIFIERS)[number];

/** What a player ended a round with. */
export interface Flip7Entry {
    /** The number cards held, each from 0 to 12. */
    readonly numbers: readonly number[];
    /** The modifier cards held. */
    readonly modifiers: readonly Flip7Modifier[];
    /** Whether the player bust, which scores nothing whatever is held. */
    readonly bust: boolean;
}

/** A round as entered: each player's entry by player id. A player with none has yet to play. */
export interface Flip7Round {
    readonly entries: Readonly<Record<string, Flip7Entry>>;
}

const HIGHEST_NUMBER = 12;
/** How many different numbers end the round and earn the bonus. */
const FLIP = 7;
const BONUS = 15;
const TARGET = 200;

/** What each plus card adds. The x2 card adds nothing and doubles the numbers instead. */
const PLUS: Readonly<Record<Flip7Modifier, number>> = {
    '+2': 2,
    '+4': 4,
    '+6': 6,
    '+8': 8,
    '+10': 10,
    x2: 0,
};

const isModifier = (value: unknown): value is Flip7Modifier =>
    FLIP_7_MODIFIERS.some((modifier) => modifier === value);

const isNumberCard = (value: unknown): value is number =>
    isWhole(value) && value >= 0 && value <= HIGHEST_NUMBER;

/** The first value an array holds more than once, if any. */
const firstRepeated = <Value>(values: readonly Value[]): Value | undefined =>
    values.find((value, index) => values.indexOf(value) !== index);

/** A card the deck does not hold, named by the list it was entered in. */
const unknownCard = (card: unknown, kind: 'number' | 'modifier'): Refusal =>
    refusal('unknown-card', `The deck holds no ${kind} card ${JSON.stringify(plain(card))}.`, {
        card: plain(card),
        kind,
    });

/** Reads an entry as entered, or says why it is not one. */
const readEntry = (raw: unknown): Flip7Entry | Refusal => {
    if (!isRecord(raw)) return refusal('not-an-entry', 'The entry is not an object.', {});
    const { numbers, modifiers, bust } = raw;
    if (typeof bust !== 'boolean')
        return refusal('not-an-entry', 'The entry does not say whether the player bust.', {
            part: 'bust',
        });
    if (!Array.isArray(numbers))
        return refusal('not-an-entry', 'The entry does not list its number cards.', {
            part: 'numbers',
        });
    if (!Array.isArray(modifiers))
        return refusal('not-an-entry', 'The entry does not list its modifier cards.', {
            part: 'modifiers',
        });
    // Found by place, so a card that is itself undefined is refused like any other.
    const unknownNumber = numbers.findIndex((card) => !isNumberCard(card));
    if (unknownNumber !== -1) return unknownCard(numbers[unknownNumber], 'number');
    const unknownModifier = modifiers.findIndex((card) => !isModifier(card));
    if (unknownModifier !== -1) return unknownCard(modifiers[unknownModifier], 'modifier');
    return { numbers: numbers.filter(isNumberCard), modifiers: modifiers.filter(isModifier), bust };
};

/** What the rules refuse in a hand that did not bust, if anything. */
const handRefusal = (entry: Flip7Entry): Refusal | null => {
    const number = firstRepeated(entry.numbers);
    if (number !== undefined)
        return refusal('number-twice', `The hand holds the ${number} twice, which is a bust.`, {
            number,
        });
    const modifier = firstRepeated(entry.modifiers);
    if (modifier !== undefined)
        return refusal(
            'modifier-twice',
            `The hand holds the ${modifier} twice, and the deck has one.`,
            { modifier }
        );
    if (entry.numbers.length > FLIP)
        return refusal('too-many-numbers', `The round ends at ${FLIP} different numbers.`, {
            max: FLIP,
            given: entry.numbers.length,
        });
    return null;
};

/** A hand's score. */
const scoreEntry = (entry: Flip7Entry): number => {
    if (entry.bust) return 0;
    const numbers = entry.numbers.reduce((sum, card) => sum + card, 0);
    const doubled = entry.modifiers.includes('x2') ? numbers * 2 : numbers;
    const plus = entry.modifiers.reduce((sum, card) => sum + PLUS[card], 0);
    return doubled + plus + (entry.numbers.length === FLIP ? BONUS : 0);
};

/** One player's entry read and checked: its score, or why it is refused. */
const readPlayer = (raw: unknown): number | Refusal => {
    const entry = readEntry(raw);
    if ('code' in entry) return entry;
    // A bust scores nothing whatever is held, so its cards are checked only for being in the deck.
    return (entry.bust ? null : handRefusal(entry)) ?? scoreEntry(entry);
};

const scoreRound = (round: unknown, context: RoundContext): RoundOutcome => {
    // A round of Flip 7 needs an entry from each player and nothing more.
    const { scores, problems, allIn } = readEntries(round, context, readPlayer);
    return { scores, problems, complete: allIn };
};

/** The one player alone on the highest total, once it has reached the target. */
const winners = (totals: readonly number[]): readonly number[] | null => {
    const highest = Math.max(...totals);
    if (highest < TARGET) return null;
    const leading = totals.flatMap((total, seat) => (total === highest ? [seat] : []));
    // A tie at the top does not end the game. It goes on by whole rounds until one player leads.
    return leading.length === 1 ? leading : null;
};

export const FLIP_7: Rules = {
    id: 'flip-7',
    name: 'Flip 7',
    rules: 1,
    minPlayers: 3,
    maxPlayers: null,
    ahead: 'highest',
    // The published rules are the only ones this version knows.
    checkOptions: noOptions('Flip 7'),
    scoreRound,
    winners,
};
