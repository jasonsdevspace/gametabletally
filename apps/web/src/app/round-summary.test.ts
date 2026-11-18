import { describe, expect, it } from 'vitest';

import { entrySummary, flip7Note, roundSummary } from './round-summary.js';

const hand = (numbers: number[], modifiers: ('+4' | 'x2')[] = [], bust = false) => ({
    numbers,
    modifiers,
    bust,
});

describe('a round in words', () => {
    it("says the round and each player's score in seat order", () => {
        expect(
            roundSummary(1, [
                { name: 'Ann', score: 20, note: 'x2 doubled the numbers' },
                { name: 'Ben', score: 0, note: 'bust' },
                { name: 'Cat', score: 12 },
            ])
        ).toBe('Round 2 saved. Ann 20, x2 doubled the numbers. Ben 0, bust. Cat 12.');
    });

    it('says a player out of the round is out of it, with no score', () => {
        expect(roundSummary(0, [{ name: 'Ann', out: true }])).toBe(
            'Round 1 saved. Ann out of the round.'
        );
    });

    it("says one player's entry is in, with what the rules did to it", () => {
        expect(entrySummary({ name: 'Ann', score: 9 })).toBe("Ann's entry is in: 9.");
        expect(entrySummary({ name: 'Ben', score: 0, note: 'bust' })).toBe(
            "Ben's entry is in: 0, bust."
        );
    });

    it('states no score the rules did not give, rather than a zero', () => {
        expect(entrySummary({ name: 'Ann' })).toBe("Ann's entry is in.");
        expect(roundSummary(0, [{ name: 'Ann' }])).toBe('Round 1 saved. Ann.');
    });
});

describe("what Flip 7's rules did to a hand", () => {
    it('says nothing of a hand the rules only added up', () => {
        expect(flip7Note(hand([3, 7], ['+4']))).toBe('');
    });

    it('says a bust, whatever the hand holds', () => {
        expect(flip7Note(hand([3, 7], ['x2'], true))).toBe('bust');
    });

    it('says the x2 doubled the numbers only where it had numbers to double', () => {
        expect(flip7Note(hand([3], ['x2']))).toBe('x2 doubled the numbers');
        expect(flip7Note(hand([], ['x2', '+4']))).toBe('');
        expect(flip7Note(hand([0], ['x2']))).toBe('');
    });

    it('says the bonus for seven numbers, as the rules set it', () => {
        expect(flip7Note(hand([1, 2, 3, 4, 5, 6, 7]))).toBe('15 for 7 numbers');
        expect(flip7Note(hand([1, 2, 3, 4, 5, 6, 7], ['x2']))).toBe(
            'x2 doubled the numbers and 15 for 7 numbers'
        );
    });
});
