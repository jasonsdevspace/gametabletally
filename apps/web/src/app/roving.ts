import { type FocusEvent, type KeyboardEvent, useState } from 'react';

/*
 * One stop for the Tab key in a grid of buttons, with the arrow keys moving between its cells, as
 * the design kit leaves to the page. Left and right move one cell, up and down move to the nearest
 * cell in the row above or below as the grid is drawn, so it holds whatever the number of columns,
 * and Home and End reach the ends. A cell that is off keeps its place, as it does in the tab order.
 */

/** Where a cell is drawn: its left, top, width and height. */
export interface Box {
    readonly left: number;
    readonly top: number;
    readonly width: number;
    readonly height: number;
}

/** The keys that move in a grid. */
const KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'] as const;
type MoveKey = (typeof KEYS)[number];

export const isMoveKey = (key: string): key is MoveKey => KEYS.some((one) => one === key);

/** The cell nearest across in the next row up or down from a cell, or the cell itself at an edge. */
const across = (at: number, boxes: readonly Box[], down: boolean): number => {
    const here = boxes[at];
    if (here === undefined) return at;
    const middle = here.left + here.width / 2;
    const rows = boxes
        .map((box, index) => ({ box, index }))
        .filter(({ box }) =>
            down ? box.top >= here.top + here.height / 2 : box.top + box.height / 2 <= here.top
        );
    if (rows.length === 0) return at;
    const nearest = down
        ? Math.min(...rows.map(({ box }) => box.top))
        : Math.max(...rows.map(({ box }) => box.top));
    const row = rows.filter(({ box }) => box.top === nearest);
    const best = row.reduce((closest, one) =>
        Math.abs(one.box.left + one.box.width / 2 - middle) <
        Math.abs(closest.box.left + closest.box.width / 2 - middle)
            ? one
            : closest
    );
    return best.index;
};

/**
 * The cell a key moves to from a cell, by where the cells are drawn. Left and right are swapped for
 * a page read from right to left.
 */
export const cellAfter = (
    key: MoveKey,
    at: number,
    boxes: readonly Box[],
    rightToLeft = false
): number => {
    const last = boxes.length - 1;
    const back = rightToLeft ? 'ArrowRight' : 'ArrowLeft';
    if (key === 'Home') return 0;
    if (key === 'End') return last;
    if (key === 'ArrowUp' || key === 'ArrowDown') return across(at, boxes, key === 'ArrowDown');
    return key === back ? Math.max(0, at - 1) : Math.min(last, at + 1);
};

/** The buttons a grid holds, in order. */
const cellsOf = (grid: HTMLElement): HTMLElement[] =>
    Array.from(grid.querySelectorAll<HTMLElement>(':scope > button'));

/**
 * A grid's one stop: the tabindex of each cell, and the handlers the grid takes, which move focus
 * with the arrow keys and follow it wherever it lands, as by a tap.
 */
export const useRoving = (count: number) => {
    const [active, setActive] = useState(0);
    const at = Math.min(active, Math.max(0, count - 1));
    return {
        tabIndexOf: (index: number) => (index === at ? 0 : -1),
        onFocus: (event: FocusEvent<HTMLElement>) => {
            const index = cellsOf(event.currentTarget).findIndex((cell) => cell === event.target);
            if (index >= 0) setActive(index);
        },
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            if (!isMoveKey(event.key)) return;
            const cells = cellsOf(event.currentTarget);
            const from = cells.findIndex((cell) => cell === event.target);
            if (from < 0) return;
            event.preventDefault();
            const boxes = cells.map((cell) => {
                const { left, top, width, height } = cell.getBoundingClientRect();
                return { left, top, width, height };
            });
            const rightToLeft = getComputedStyle(event.currentTarget).direction === 'rtl';
            const to = cellAfter(event.key, from, boxes, rightToLeft);
            setActive(to);
            cells[to]?.focus();
        },
    };
};
