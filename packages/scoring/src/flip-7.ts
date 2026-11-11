import { isRecord, isWhole, type RoundContext, type RoundOutcome, type Rules } from './rules.js';
import type { Problem } from './types.js';

/**
 * Flip 7, as published. A player ends a round holding number cards and modifier cards, or
 * having bust. The round's score is the number cards added up, doubled by the x2 card, plus each
 * plus card, plus fifteen for seven different numbers. Neither the plus cards nor the fifteen
 * are ever doubled. A bust scores nothing. The game ends with the round in which a player
 * reaches two hundred, and the highest total wins. A tie at the top does not end it.
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

/** Why an entry is refused: a code that never changes, and the reason in a sentence. */
interface Refusal {
    readonly code: string;
    readonly message: string;
}

const refused = (code: string, message: string): Refusal => ({ code, message });

/** Reads an entry as entered, or says why it is not one. */
const readEntry = (raw: unknown): Flip7Entry | Refusal => {
    if (!isRecord(raw)) return refused('not-an-entry', 'The entry is not an object.');
    const { numbers, modifiers, bust } = raw;
    if (typeof bust !== 'boolean')
        return refused('not-an-entry', 'The entry does not say whether the player bust.');
    if (!Array.isArray(numbers) || !Array.isArray(modifiers))
        return refused('not-an-entry', 'The entry does not list its number and modifier cards.');
    const unknownNumber: unknown = numbers.find((card) => !isNumberCard(card));
    if (unknownNumber !== undefined)
        return refused(
            'unknown-card',
            `The deck holds no number card ${JSON.stringify(unknownNumber)}.`
        );
    const unknownModifier: unknown = modifiers.find((card) => !isModifier(card));
    if (unknownModifier !== undefined)
        return refused(
            'unknown-card',
            `The deck holds no modifier card ${JSON.stringify(unknownModifier)}.`
        );
    return { numbers: numbers.filter(isNumberCard), modifiers: modifiers.filter(isModifier), bust };
};

/** What the rules refuse in a hand that did not bust, by code and reason, if anything. */
const refusal = (entry: Flip7Entry): Refusal | null => {
    const number = firstRepeated(entry.numbers);
    if (number !== undefined)
        return refused('number-twice', `The hand holds the ${number} twice, which is a bust.`);
    const modifier = firstRepeated(entry.modifiers);
    if (modifier !== undefined)
        return refused(
            'modifier-twice',
            `The hand holds the ${modifier} twice, and the deck has one.`
        );
    if (entry.numbers.length > FLIP)
        return refused('too-many-numbers', `The round ends at ${FLIP} different numbers.`);
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
    // A bust scores nothing whatever is held, so its cards are not held to the rules.
    return (entry.bust ? null : refusal(entry)) ?? scoreEntry(entry);
};

const scoreRound = (round: unknown, { players, index }: RoundContext): RoundOutcome => {
    const problem = (code: string, message: string, player: string | null): Problem => ({
        code,
        message,
        round: index,
        player,
    });
    if (!isRecord(round) || !isRecord(round['entries']))
        return {
            scores: new Map(),
            problems: [problem('not-a-round', 'The round does not hold its entries.', null)],
        };
    const { entries } = round;
    const scores = new Map<string, number>();
    const problems: Problem[] = Object.keys(entries)
        .filter((id) => !players.includes(id))
        .map((id) => problem('unknown-player', 'The entry is for nobody in the game.', id));
    for (const player of players) {
        if (!(player in entries)) continue;
        const read = readPlayer(entries[player]);
        if (typeof read === 'number') scores.set(player, read);
        else problems.push(problem(read.code, read.message, player));
    }
    return { scores, problems };
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
    checkOptions: (options) =>
        Object.keys(options).map((name) => ({
            code: 'unknown-option',
            message: `Flip 7 has no option named ${JSON.stringify(name)}.`,
            round: null,
            player: null,
        })),
    scoreRound,
    winners,
};
