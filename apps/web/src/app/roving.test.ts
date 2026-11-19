import { describe, expect, it } from 'vitest';

import { type Box, cellAfter, isMoveKey } from './roving.js';

/* The cell a key moves to in a grid of buttons, from where the cells are drawn. */

/** A grid's cells laid out in rows of a number of columns, each 10 wide and 10 tall. */
const grid = (count: number, columns: number): Box[] =>
    Array.from({ length: count }, (_, at) => ({
        left: (at % columns) * 10,
        top: Math.floor(at / columns) * 10,
        width: 10,
        height: 10,
    }));

describe('a grid of buttons with one stop', () => {
    const numbers = grid(13, 5);

    it('moves one cell left and right, and stays at either end', () => {
        expect(cellAfter('ArrowRight', 0, numbers)).toBe(1);
        expect(cellAfter('ArrowLeft', 1, numbers)).toBe(0);
        expect(cellAfter('ArrowLeft', 0, numbers)).toBe(0);
        expect(cellAfter('ArrowRight', 12, numbers)).toBe(12);
        expect(cellAfter('ArrowRight', 4, numbers)).toBe(5);
    });

    it('moves to the cell above or below, and to the nearest in a shorter last row', () => {
        expect(cellAfter('ArrowDown', 1, numbers)).toBe(6);
        expect(cellAfter('ArrowUp', 6, numbers)).toBe(1);
        expect(cellAfter('ArrowDown', 9, numbers)).toBe(12);
        expect(cellAfter('ArrowDown', 12, numbers)).toBe(12);
        expect(cellAfter('ArrowUp', 2, numbers)).toBe(2);
    });

    it('reaches the ends with Home and End', () => {
        expect(cellAfter('Home', 7, numbers)).toBe(0);
        expect(cellAfter('End', 7, numbers)).toBe(12);
    });

    it('holds for any number of columns, as the modifiers wrap on a narrow phone', () => {
        const modifiers = grid(6, 3);
        expect(cellAfter('ArrowDown', 1, modifiers)).toBe(4);
        expect(cellAfter('ArrowRight', 2, modifiers)).toBe(3);
    });

    it('swaps left and right for a page read from right to left', () => {
        expect(cellAfter('ArrowLeft', 1, numbers, true)).toBe(2);
        expect(cellAfter('ArrowRight', 1, numbers, true)).toBe(0);
    });

    it('moves only on the arrow keys, Home and End', () => {
        expect(isMoveKey('ArrowDown')).toBe(true);
        expect(isMoveKey('Tab')).toBe(false);
        expect(isMoveKey('Enter')).toBe(false);
    });
});
