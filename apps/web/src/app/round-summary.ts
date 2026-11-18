import type { Flip7Entry } from '@gametabletally/scoring';

/*
 * What the toast says after a round is saved, or a player's entry in it is in, for every game alike.
 * A game gives the lines of its summary, one for each player, and this piece puts them in words: what
 * each player scored, and anything the rules did that a table might argue with, such as a doubled
 * score, said in words.
 */

/** One player's part of a round, as a game gives it. */
export interface RoundLine {
    readonly name: string;
    /** What the player scored in the round, or null for a player out of it. */
    readonly score: number | null;
    /** What the rules did to the score, in words, such as "doubled by the x2", if anything. */
    readonly note?: string;
}

/** A score in words, with what the rules did to it, such as "23, numbers doubled by the x2". */
const scoreWords = ({ score, note }: RoundLine): string =>
    score === null
        ? 'out of the round'
        : note === undefined || note === ''
          ? String(score)
          : `${String(score)}, ${note}`;

/** The toast's words after a round is saved: the round, then each player's line. */
export const roundSummary = (index: number, lines: readonly RoundLine[]): string =>
    [
        `Round ${String(index + 1)} saved.`,
        ...lines.map((line) => `${line.name} ${scoreWords(line)}.`),
    ].join(' ');

/** The toast's words after one player's entry is in, before the next player's begins. */
export const entrySummary = (line: RoundLine): string =>
    `${line.name}'s entry is in: ${scoreWords(line)}.`;

/** How many different numbers end a round of Flip 7, and earn its bonus. */
const FLIP = 7;
const BONUS = 15;

/** What the rules did to a Flip 7 hand's score, in words, or nothing where they only added it up. */
export const flip7Note = (hand: Flip7Entry): string => {
    if (hand.bust) return 'bust';
    const notes: string[] = [];
    if (hand.modifiers.includes('x2')) notes.push('numbers doubled by the x2');
    if (hand.numbers.length === FLIP)
        notes.push(`with ${String(BONUS)} for ${String(FLIP)} numbers`);
    return notes.join(' ');
};
