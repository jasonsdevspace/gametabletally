import { type FocusEvent, type KeyboardEvent, type MouseEvent, useState } from 'react';

/*
 * One stop for the Tab key in a grid of buttons, with the arrow keys moving between its cells, as
 * the design kit leaves to the page. Left and right move one cell, up and down move to the nearest
 * cell in the row above or below as the grid is drawn, so it holds whatever the number of columns,
 * and Home and End reach the ends. A cell that is off keeps its place, as it does in the tab order.
 * An arrow held with Alt, Control or Command is left to the browser, as its own shortcut.
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
    const first = rows.reduce((near, one) =>
        down ? (one.box.top < near.box.top ? one : near) : one.box.top > near.box.top ? one : near
    ).box;
    // A cell is in that row when its middle falls within the row's height, so a cell drawn a
    // fraction of a pixel lower is not left out of it.
    const row = rows.filter(({ box }) => {
        const middle = box.top + box.height / 2;
        return middle >= first.top && middle <= first.top + first.height;
    });
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

/** The index of the cell an event landed in, or -1 where it landed in none. */
const indexIn = (grid: HTMLElement, target: EventTarget): number =>
    cellsOf(grid).findIndex((cell) => target instanceof Node && cell.contains(target));

/**
 * A grid's one stop: the tabindex of each cell, and the handlers the grid takes, which move focus
 * with the arrow keys and follow it wherever it lands, by a tap as well, since some browsers do not
 * focus a button that is tapped. The stop goes back to the first cell when `fresh` changes, as for
 * the next player's hand.
 */
export const useRoving = (fresh: string) => {
    const [stop, setStop] = useState({ fresh, at: 0 });
    let at = stop.at;
    if (stop.fresh !== fresh) {
        at = 0;
        setStop({ fresh, at });
    }
    const follow = (index: number) => {
        if (index >= 0) setStop({ fresh, at: index });
    };
    return {
        tabIndexOf: (index: number) => (index === at ? 0 : -1),
        onFocus: (event: FocusEvent<HTMLElement>) => {
            follow(indexIn(event.currentTarget, event.target));
        },
        onClick: (event: MouseEvent<HTMLElement>) => {
            follow(indexIn(event.currentTarget, event.target));
        },
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
            if (event.altKey || event.ctrlKey || event.metaKey || !isMoveKey(event.key)) return;
            const cells = cellsOf(event.currentTarget);
            const from = cells.findIndex((cell) => cell === event.target);
            if (from < 0) return;
            event.preventDefault();
            const boxes = cells.map((cell) => {
                const { left, top, width, height } = cell.getBoundingClientRect();
                return { left, top, width, height };
            });
            const rightToLeft = getComputedStyle(event.currentTarget).direction === 'rtl';
            // Focus moving to the cell makes it the stop, through the grid's focus handler.
            cells[cellAfter(event.key, from, boxes, rightToLeft)]?.focus();
        },
    };
};
