import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/*
 * A focus request a screen asks for as it is taken away still lands, a frame later, on the main
 * region of whatever page is drawn then, and a focus the page moves before a request lands keeps
 * that request from landing. Each test waits out that frame once its screens are gone, so a
 * request its last press asked for never lands in the next test's page.
 */
afterEach(async () => {
    cleanup();
    await new Promise((resolve) => {
        requestAnimationFrame(resolve);
    });
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
