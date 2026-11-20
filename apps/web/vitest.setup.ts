import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterAll, afterEach } from 'vitest';

afterEach(() => {
    cleanup();
});

/*
 * The kit's toast measures itself as it shows, by a ResizeObserver, which jsdom does not have.
 * Nothing is laid out here, so one that never reports stands in for it. Sizes are the browser
 * tests' to check.
 */
if (!('ResizeObserver' in globalThis))
    Object.assign(globalThis, {
        ResizeObserver: class {
            observe(): void {}
            unobserve(): void {}
            disconnect(): void {}
        },
    });

/*
 * The kit's controls ask whether a control can be seen before they move focus to it, by
 * checkVisibility, which jsdom does not have. Nothing is laid out here, so one that counts a control
 * seen unless it or what holds it is hidden or not displayed stands in for it.
 */
if (!('checkVisibility' in Element.prototype))
    Object.assign(Element.prototype, {
        checkVisibility(this: Element): boolean {
            const shown = (at: Element | null): boolean =>
                at === null ||
                (!at.hasAttribute('hidden') &&
                    getComputedStyle(at).display !== 'none' &&
                    shown(at.parentElement));
            return shown(this);
        },
    });

/*
 * The kit's status line clears its own timers as it is let go, but a focus request the kit lands a
 * frame later, such as Try again's `moveFocus` or a view's arrival, reads the document as it lands,
 * and a stepper's and a form's reset run a moment after the event. Each file waits out that frame
 * before its window goes, so none of them finds the document gone. The toast's own wait before it
 * leaves, five seconds, is longer than any file waits.
 */
afterAll(
    () =>
        new Promise((resolve) => {
            setTimeout(resolve, 50);
        })
);
