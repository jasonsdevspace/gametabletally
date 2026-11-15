import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

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
