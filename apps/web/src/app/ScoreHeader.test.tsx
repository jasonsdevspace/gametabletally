import base from '@jasonsdevspace/design-kit/base.css?raw';
import { render, screen } from './render.testing.js';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import sheet from '../styles/screens.css?raw';
import { cardsOf, changeOf, ScoreHeader, spokenOf } from './ScoreHeader.js';
import { heard } from './status.testing.js';

/* The score header on its own, with no game screen around it. */

const status = () => screen.getByRole('status');

describe('the score header', () => {
    it("shows the player's name, their total as one image named by the number, and how it adds up", () => {
        render(<ScoreHeader name="Ann" total={42} line="40 last round and 2 this round." />);
        expect(screen.getByText('Now scoring')).toHaveClass('dk-eyebrow');
        expect(screen.getByText('Ann')).toBeVisible();
        const digits = screen.getByRole('img', { name: '42' });
        expect([...digits.children].map((card) => card.textContent)).toEqual(['4', '2']);
        expect(screen.getByText('40 last round and 2 this round.')).toBeVisible();
    });

    it('names a negative total with the word minus, and draws a true minus sign', () => {
        render(<ScoreHeader name="Ben" total={-7} line="" />);
        const digits = screen.getByRole('img', { name: 'minus 7' });
        expect([...digits.children].map((card) => card.textContent)).toEqual(['−', '7']);
        // The sign's card has no fold, since a fold would make it read as an equals sign.
        expect(digits.children[0]).toHaveAttribute('data-sign');
        expect(digits.children[1]).not.toHaveAttribute('data-sign');
    });

    it('holds one status line from the first draw, saying nothing until something changes', () => {
        render(<ScoreHeader name="Ann" total={0} line="" />);
        expect(status()).toHaveTextContent('');
    });

    it('says each new total, and only who is next after a turn, in the same status line', async () => {
        const { rerender } = render(<ScoreHeader name="Ann" total={0} line="" />);
        const line = status();
        rerender(<ScoreHeader name="Ann" total={12} line="" />);
        expect(status()).toBe(line);
        await heard(line, "Ann's total is 12.");
        rerender(<ScoreHeader name="Ben" total={-3} line="" />);
        expect(status()).toBe(line);
        await heard(line, 'Ben is next.');
        rerender(<ScoreHeader name="Ben" total={-5} line="" />);
        await heard(line, "Ben's total is minus 5.");
    });

    it('says the same change again when it is made twice', async () => {
        const { rerender } = render(<ScoreHeader name="Ann" total={0} line="" />);
        rerender(<ScoreHeader name="Ben" total={0} line="" />);
        await heard(status(), 'Ben is next.');
        rerender(<ScoreHeader name="Ann" total={0} line="" />);
        rerender(<ScoreHeader name="Ben" total={0} line="" />);
        // The line is emptied before the words are put in again, so they are heard again.
        expect(status()).toHaveTextContent('');
        await heard(status(), 'Ben is next.');
    });

    it('draws the first total still, then flips only the card whose character changed', () => {
        const { rerender } = render(<ScoreHeader name="Ann" total={-41} line="" />);
        const [sign, tens, ones] = screen.getByRole('img').children;
        for (const card of [sign, tens, ones]) expect(card).toHaveAttribute('data-still');
        rerender(<ScoreHeader name="Ann" total={-42} line="" />);
        const after = [...screen.getByRole('img').children];
        expect(after[0]).toBe(sign);
        expect(after[1]).toBe(tens);
        expect(after[2]).not.toBe(ones);
        expect(after[2]).not.toHaveAttribute('data-still');
        // A total with another digit keeps its sign still.
        rerender(<ScoreHeader name="Ann" total={-142} line="" />);
        expect(screen.getByRole('img').children[0]).toBe(sign);
    });

    it("flips every card of a new player's total, since it is someone else's number", () => {
        const { rerender } = render(<ScoreHeader name="Ann" total={42} line="" />);
        const before = [...screen.getByRole('img').children];
        rerender(<ScoreHeader name="Ben" total={42} line="" />);
        const after = [...screen.getByRole('img').children];
        for (const [at, card] of after.entries()) {
            expect(card).not.toBe(before[at]);
            expect(card).not.toHaveAttribute('data-still');
        }
    });

    it('draws no line under the total when it is given none', () => {
        const { container } = render(<ScoreHeader name="Ann" total={0} line="" />);
        expect(container.querySelector('.gtt-score-line')).toBeNull();
    });

    it('passes the axe audit', async () => {
        const { container } = render(
            <main>
                <ScoreHeader name="Ann" total={-12} line="Minus 12 so far." />
            </main>
        );
        const results = await axe.run(container);
        expect(results.violations.map(({ id }) => id)).toEqual([]);
    });

    it("flips over the kit's medium duration, which the kit's base stops under reduced motion", () => {
        expect(sheet).toMatch(/\.gtt-digit \{[^}]*animation: gtt-flip var\(--dk-duration-medium\)/);
        const reduced = base.slice(base.indexOf('@media (prefers-reduced-motion: reduce)'));
        expect(reduced).toMatch(/^@media[^{]*\{[^@]*animation-duration: 0\.01ms !important/);
    });
});

describe('the words of the score header', () => {
    it('says a total with a minus sign as a word', () => {
        expect(spokenOf(0)).toBe('0');
        expect(spokenOf(-10)).toBe('minus 10');
    });

    it('draws a card for each character', () => {
        expect(cardsOf(105)).toEqual(['1', '0', '5']);
        expect(cardsOf(-2)).toEqual(['−', '2']);
    });

    it('says who is next after a turn, the new total after an entry, and nothing for no change', () => {
        expect(changeOf({ name: 'Ann', total: 3 }, { name: 'Ben', total: 9 })).toBe('Ben is next.');
        expect(changeOf({ name: 'Ann', total: 3 }, { name: 'Ann', total: 9 })).toBe(
            "Ann's total is 9."
        );
        expect(changeOf({ name: 'Ann', total: 3 }, { name: 'Ann', total: 3 })).toBeNull();
    });

    it("says a round typed in with the total, so a press that leaves the total is heard, and a turn's first step", () => {
        const at = (round: number | null, total = 60) => ({ name: 'Ann', total, round });
        expect(changeOf(at(null), at(0))).toBe('Ann, 0 this round, 60 in all.');
        expect(changeOf(at(1, 61), at(-12, 48))).toBe('Ann, minus 12 this round, 48 in all.');
        expect(changeOf(at(5, 65), at(null))).toBe('Ann, nothing this round, 60 in all.');
        expect(changeOf(at(5, 65), at(5, 65))).toBeNull();
        expect(
            changeOf(
                { name: 'Ann', total: 3 },
                { name: 'Ben', total: 9 },
                "Type Ben's total on the pad."
            )
        ).toBe("Ben is next. Type Ben's total on the pad.");
    });
});
