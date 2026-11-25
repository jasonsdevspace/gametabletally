import { createContext, useCallback, useContext, useEffect, useState } from 'react';

/**
 * Keeps the phone's screen lit while `on` holds, so a phone left on the table between turns does
 * not dim and lock before the next player's entry. The lock is let go when `on` stops holding and
 * while the page is hidden, as the browser lets it go by itself then, and asked for again once the
 * page is shown, or where the browser lets it go by itself while it is still wanted. A browser with
 * no way to keep the screen lit, or one that refuses, is left alone with nothing said, since the
 * app works the same without it.
 */
const useAwake = (on: boolean): void => {
    useEffect(() => {
        if (!on || !('wakeLock' in navigator)) return undefined;
        let lock: WakeLockSentinel | null = null;
        let left = false;
        const letGo = () => {
            const was = lock;
            lock = null;
            was?.release().catch(() => undefined);
        };
        const ask = () => {
            if (document.visibilityState !== 'visible') {
                letGo();
                return;
            }
            navigator.wakeLock.request('screen').then(
                (granted) => {
                    // Granted after the game was left, or beside one already held.
                    letGo();
                    if (left) {
                        granted.release().catch(() => undefined);
                        return;
                    }
                    lock = granted;
                    // Let go by the browser while still held here, rather than by this page.
                    granted.addEventListener('release', () => {
                        if (lock === granted) {
                            lock = null;
                            ask();
                        }
                    });
                },
                () => undefined
            );
        };
        ask();
        document.addEventListener('visibilitychange', ask);
        return () => {
            left = true;
            document.removeEventListener('visibilitychange', ask);
            letGo();
        };
    }, [on]);
};

/** What a game's screen says it holds: a way to keep the screen lit, and its letting go. */
const AwakeContext = createContext<() => () => void>(() => () => undefined);

/**
 * Keeps the screen lit for as long as the screens that ask for it are open, counted so that a move
 * from one game's screen to another lets go only where neither asks.
 */
export const useAwakeHolder = (): (() => () => void) => {
    const [held, setHeld] = useState(0);
    useAwake(held > 0);
    return useCallback(() => {
        setHeld((count) => count + 1);
        return () => {
            setHeld((count) => count - 1);
        };
    }, []);
};

export const AwakeProvider = AwakeContext.Provider;

/** Keeps the screen lit while `on` holds, as a screen about a game in play asks. */
export const useKeepAwake = (on: boolean): void => {
    const hold = useContext(AwakeContext);
    useEffect(() => (on ? hold() : undefined), [on, hold]);
};
