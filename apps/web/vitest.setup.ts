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
 * The kit's status line keeps its timer for putting words in after the line leaves the page, so
 * one started by a test's last words can fire once the file's window is gone, and fail the run
 * with no test failing. Each file waits out that tenth of a second before its window goes. The
 * kit stops its timers as a line leaves in its 0.9.2, design-kit#533, so this goes once the pin
 * moves to 0.9.2.
 */
afterAll(
    () =>
        new Promise((resolve) => {
            setTimeout(resolve, 150);
        })
);
