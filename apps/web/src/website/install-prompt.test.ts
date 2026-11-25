import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    install,
    type InstallPromptEvent,
    listenForInstall,
    useInstall,
} from './install-prompt.js';

/** The event a browser fires when it would install the app, answered as the visitor answers. */
const offerOf = (outcome: 'accepted' | 'dismissed') => {
    const prompt = vi.fn(() => Promise.resolve());
    const event: InstallPromptEvent = Object.assign(
        new Event('beforeinstallprompt', { cancelable: true }),
        { prompt, userChoice: Promise.resolve({ outcome }) }
    );
    return { event, prompt };
};

/** A window that is, or is not, open as the installed app. */
const openAs = (standalone: boolean) => {
    vi.stubGlobal(
        'matchMedia',
        vi.fn((query: string) => ({ matches: standalone && query.includes('standalone') }))
    );
};

let stop: (() => void) | undefined;

afterEach(() => {
    stop?.();
    vi.unstubAllGlobals();
});

describe("the browser's offer to install", () => {
    it('holds no offer until the browser makes one', () => {
        openAs(false);
        stop = listenForInstall();
        const { result } = renderHook(() => useInstall());
        expect(result.current.kind).toBe('none');
    });

    it("holds the browser's offer, so the browser shows none of its own", () => {
        openAs(false);
        stop = listenForInstall();
        const { result } = renderHook(() => useInstall());
        const { event } = offerOf('dismissed');
        act(() => {
            window.dispatchEvent(event);
        });
        expect(event.defaultPrevented).toBe(true);
        expect(result.current.kind).toBe('offered');
    });

    it('shows the offer once when asked, and marks the app installed when it is accepted', async () => {
        openAs(false);
        stop = listenForInstall();
        const { result } = renderHook(() => useInstall());
        const { event, prompt } = offerOf('accepted');
        act(() => {
            window.dispatchEvent(event);
        });
        await act(() => install());
        expect(prompt).toHaveBeenCalledOnce();
        expect(result.current.kind).toBe('installed');
        await act(() => install());
        expect(prompt).toHaveBeenCalledOnce();
    });

    it('lets a dismissed offer go, since an offer can be shown only once', async () => {
        openAs(false);
        stop = listenForInstall();
        const { result } = renderHook(() => useInstall());
        act(() => {
            window.dispatchEvent(offerOf('dismissed').event);
        });
        await act(() => install());
        expect(result.current.kind).toBe('none');
    });

    it('marks the app installed when the browser says it was, from its own menu too', () => {
        openAs(false);
        stop = listenForInstall();
        const { result } = renderHook(() => useInstall());
        act(() => {
            window.dispatchEvent(offerOf('dismissed').event);
            window.dispatchEvent(new Event('appinstalled'));
        });
        expect(result.current.kind).toBe('installed');
    });

    it('knows the page is the installed app when it opens as one, and takes no offer then', () => {
        openAs(true);
        stop = listenForInstall();
        const { result } = renderHook(() => useInstall());
        act(() => {
            window.dispatchEvent(offerOf('dismissed').event);
        });
        expect(result.current.kind).toBe('installed');
    });

    it('keeps the offer while the browser asks, so the button that asked stays', async () => {
        openAs(false);
        stop = listenForInstall();
        const { result } = renderHook(() => useInstall());
        type Choice = { outcome: 'accepted' | 'dismissed' };
        let answer: ((choice: Choice) => void) | undefined;
        const event: InstallPromptEvent = Object.assign(
            new Event('beforeinstallprompt', { cancelable: true }),
            {
                prompt: () => Promise.resolve(),
                userChoice: new Promise<Choice>((done) => {
                    answer = done;
                }),
            }
        );
        act(() => {
            window.dispatchEvent(event);
        });
        let asked: Promise<void> = Promise.resolve();
        act(() => {
            asked = install();
        });
        expect(result.current.kind).toBe('offered');
        answer?.({ outcome: 'dismissed' });
        await act(() => asked);
        expect(result.current.kind).toBe('none');
    });

    it('lets the offer go, with nothing thrown, when the browser refuses to show it', async () => {
        openAs(false);
        stop = listenForInstall();
        const { result } = renderHook(() => useInstall());
        const event: InstallPromptEvent = Object.assign(
            new Event('beforeinstallprompt', { cancelable: true }),
            {
                prompt: () => Promise.reject(new DOMException('Used already', 'NotAllowedError')),
                userChoice: Promise.resolve({ outcome: 'dismissed' as const }),
            }
        );
        act(() => {
            window.dispatchEvent(event);
        });
        await act(() => install());
        expect(result.current.kind).toBe('none');
    });
});

describe('the count of installs', () => {
    it('counts an install where the browser reports one, and nothing for an offer', () => {
        openAs(false);
        const count = vi.fn();
        stop = listenForInstall(count);
        act(() => {
            window.dispatchEvent(offerOf('accepted').event);
        });
        expect(count).not.toHaveBeenCalled();
        act(() => {
            window.dispatchEvent(new Event('appinstalled'));
        });
        expect(count.mock.calls).toEqual([['Install']]);
    });
});
