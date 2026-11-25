import { vi } from 'vitest';

import { act } from './render.testing.js';

/*
 * The browser's Screen Wake Lock interface, stubbed for the tests of keeping the screen awake, so
 * each request and each release is counted.
 */

/** A lock the stub grants, which the page can release and the browser can drop by itself. */
export class StubLock extends EventTarget {
    released = false;
    readonly release = vi.fn(() => {
        this.drop();
        return Promise.resolve();
    });

    /** Lets go of the lock, as the browser does by itself, and says so as the browser does. */
    drop(): void {
        if (this.released) return;
        this.released = true;
        this.dispatchEvent(new Event('release'));
    }
}

/** A browser that grants each request with a lock of its own, or refuses each one. */
export const wakeLockBrowser = (refuse = false) => {
    const locks: StubLock[] = [];
    const request = vi.fn(() => {
        if (refuse) return Promise.reject(new DOMException('Refused', 'NotAllowedError'));
        const lock = new StubLock();
        locks.push(lock);
        return Promise.resolve(lock);
    });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    return { request, locks };
};

/** Takes the stub away, and the page's shown state with it. */
export const noWakeLock = (): void => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    Reflect.deleteProperty(document, 'visibilityState');
};

/** Shows or hides the page, as the browser does when the visitor switches away and back. */
export const setShown = (shown: boolean): void => {
    Object.defineProperty(document, 'visibilityState', {
        value: shown ? 'visible' : 'hidden',
        configurable: true,
    });
    act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
    });
};

/** Lets the browser's answers to the requests made so far arrive. */
export const answered = () =>
    act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });
