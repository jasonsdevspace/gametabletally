import { FLIP_7_BONUS, type Flip7Entry } from '@gametabletally/scoring';

/*
 * What the toast says after a round is saved, or a player's entry in it is in, for every game alike.
 * A game gives the lines of its summary, one for each player, and this piece puts them in words: what
 * each player scored, and anything the rules did that a table might argue with, such as a doubled
 * score, said in words.
 */

/** One player's part of a round, as a game gives it. */
export interface RoundLine {
    readonly name: string;
    /** Whether the player is out of the round, and so scored nothing in it. */
    readonly out?: boolean;
    /** What the player scored in the round, left out where the rules gave no score. */
    readonly score?: number;
    /** What the rules did to the score, in words, such as "x2 doubled the numbers", if anything. */
    readonly note?: string;
}

/** A line's score in words, with what the rules did to it, such as "20, x2 doubled the numbers". */
const scoreWords = ({ out, score, note }: RoundLine): string =>
    out === true
        ? 'out of the round'
        : [score === undefined ? '' : String(score), note ?? ''].filter(Boolean).join(', ');

/** A line in words, such as "Ann 20, x2 doubled the numbers". */
const lineWords = (line: RoundLine): string => {
    const words = scoreWords(line);
    return words === '' ? line.name : `${line.name} ${words}`;
};

/** The toast's words after a round is saved: the round, then each player's line. */
export const roundSummary = (index: number, lines: readonly RoundLine[]): string =>
    [`Round ${String(index + 1)} saved.`, ...lines.map((line) => `${lineWords(line)}.`)].join(' ');

/** The toast's words after one player's entry is in, before the next player's begins. */
export const entrySummary = (line: RoundLine): string => {
    const words = scoreWords(line);
    return words === '' ? `${line.name}'s entry is in.` : `${line.name}'s entry is in: ${words}.`;
};

/**
 * What the rules did to a Flip 7 hand's score, in words, or nothing where they only added it up:
 * a bust, the x2 where it had numbers to double, and the bonus for seven numbers.
 */
export const flip7Note = (hand: Flip7Entry): string => {
    if (hand.bust) return 'bust';
    const notes: string[] = [];
    if (hand.modifiers.includes('x2') && hand.numbers.some((card) => card > 0))
        notes.push('x2 doubled the numbers');
    if (hand.numbers.length === FLIP_7_BONUS.numbers)
        notes.push(`${String(FLIP_7_BONUS.points)} for ${String(FLIP_7_BONUS.numbers)} numbers`);
    return notes.join(' and ');
};
