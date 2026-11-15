import base from '@jasonsdevspace/design-kit/base.css?raw';
import { render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';

import sheet from '../styles/screens.css?raw';
import { cardsOf, changeOf, ScoreHeader, spokenOf } from './ScoreHeader.js';

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

    it('names a negative total as negative, and draws a true minus sign', () => {
        render(<ScoreHeader name="Ben" total={-7} line="" />);
        const digits = screen.getByRole('img', { name: 'minus 7' });
        expect([...digits.children].map((card) => card.textContent)).toEqual(['−', '7']);
        // The sign's card has no fold, which would make it read as an equals sign.
        expect(digits.children[0]).toHaveAttribute('data-sign');
        expect(digits.children[1]).not.toHaveAttribute('data-sign');
    });

    it('holds one status line from the first draw, saying nothing until something changes', () => {
        render(<ScoreHeader name="Ann" total={0} line="" />);
        expect(status()).toHaveTextContent('');
    });

    it('says each new total, and only who is next after a turn, in the same status line', () => {
        const { rerender } = render(<ScoreHeader name="Ann" total={0} line="" />);
        const line = status();
        rerender(<ScoreHeader name="Ann" total={12} line="" />);
        expect(status()).toBe(line);
        expect(line).toHaveTextContent("Ann's total is 12.");
        rerender(<ScoreHeader name="Ben" total={-3} line="" />);
        expect(status()).toBe(line);
        expect(line).toHaveTextContent('Ben is next.');
        rerender(<ScoreHeader name="Ben" total={-5} line="" />);
        expect(line).toHaveTextContent("Ben's total is minus 5.");
    });

    it('says the same change again when it is made twice', () => {
        const { rerender } = render(<ScoreHeader name="Ann" total={0} line="" />);
        rerender(<ScoreHeader name="Ben" total={0} line="" />);
        const first = status().firstElementChild;
        rerender(<ScoreHeader name="Ann" total={0} line="" />);
        rerender(<ScoreHeader name="Ben" total={0} line="" />);
        expect(status()).toHaveTextContent('Ben is next.');
        expect(status().firstElementChild).not.toBe(first);
    });

    it('flips only the card whose character changed', () => {
        const { rerender } = render(<ScoreHeader name="Ann" total={41} line="" />);
        const [tens] = screen.getByRole('img').children;
        rerender(<ScoreHeader name="Ann" total={42} line="" />);
        expect(screen.getByRole('img').children[0]).toBe(tens);
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
        const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n {4}\}/.exec(
            base
        )?.[1];
        expect(reduced).toContain('animation-duration: 0.01ms !important');
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
});
