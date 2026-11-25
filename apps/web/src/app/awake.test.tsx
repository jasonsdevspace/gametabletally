import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppFrame } from './AppFrame.js';
import { act, appLine, render, screen } from './render.testing.js';

/*
 * Keeping the screen awake while a game is played, with the browser's Screen Wake Lock interface
 * stubbed, so each request and each release is counted.
 */

/** A browser that grants each request with a lock of its own, or refuses each one. */
const wakeLockBrowser = (refuse = false) => {
    const locks: { release: ReturnType<typeof vi.fn> }[] = [];
    const request = vi.fn(() => {
        if (refuse) return Promise.reject(new DOMException('Refused', 'NotAllowedError'));
        const lock = { released: false, release: vi.fn(() => Promise.resolve()) };
        locks.push(lock);
        return Promise.resolve(lock);
    });
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
    return { request, locks };
};

/** Shows or hides the page, as the browser does when the visitor switches away and back. */
const setShown = (shown: boolean) => {
    Object.defineProperty(document, 'visibilityState', {
        value: shown ? 'visible' : 'hidden',
        configurable: true,
    });
    act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
    });
};

/** Lets the browser's answers to the requests made so far arrive. */
const answered = () =>
    act(async () => {
        await Promise.resolve();
        await Promise.resolve();
    });

const frameAt = (screenName: string) => (
    <AppFrame screen={screenName} search="?id=g-1" title={screenName} />
);

afterEach(() => {
    Reflect.deleteProperty(navigator, 'wakeLock');
    Reflect.deleteProperty(document, 'visibilityState');
});

describe('keeping the screen awake', () => {
    it("asks while a game's screens are open, and lets go once the game is left", async () => {
        const { request, locks } = wakeLockBrowser();
        const { rerender } = render(frameAt('game'));
        await answered();
        expect(request).toHaveBeenCalledWith('screen');
        // Moving between the round and the scores keeps the one lock.
        rerender(frameAt('scores'));
        await answered();
        expect(request).toHaveBeenCalledTimes(1);
        expect(locks[0]?.release).not.toHaveBeenCalled();
        rerender(frameAt('history'));
        expect(locks[0]?.release).toHaveBeenCalledTimes(1);
        rerender(frameAt('game'));
        await answered();
        expect(request).toHaveBeenCalledTimes(2);
    });

    it('asks for nothing on a screen that is not about a game in play', async () => {
        const { request } = wakeLockBrowser();
        render(frameAt('players'));
        await answered();
        expect(request).not.toHaveBeenCalled();
    });

    it('lets go while the page is hidden and asks again once it is shown', async () => {
        const { request, locks } = wakeLockBrowser();
        render(frameAt('game'));
        await answered();
        setShown(false);
        expect(locks[0]?.release).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenCalledTimes(1);
        setShown(true);
        await answered();
        expect(request).toHaveBeenCalledTimes(2);
    });

    it('lets go of a lock granted after the game was left', async () => {
        const { locks } = wakeLockBrowser();
        const { rerender } = render(frameAt('game'));
        rerender(frameAt('play'));
        await answered();
        expect(locks[0]?.release).toHaveBeenCalledTimes(1);
    });

    it('shows nothing when the browser refuses', async () => {
        const { request } = wakeLockBrowser(true);
        render(frameAt('game'));
        await answered();
        expect(request).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('alert')).toBeNull();
        expect(appLine()).toHaveTextContent('');
        expect(document.querySelector('.dk-app-toast [role="status"]')).toHaveTextContent('');
    });

    it('works the same in a browser with no way to keep the screen awake', async () => {
        render(frameAt('game'));
        await answered();
        setShown(false);
        setShown(true);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('game');
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
