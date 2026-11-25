import { useEffect } from 'react';

/**
 * Keeps the phone's screen lit while `on` holds, so a phone left on the table between turns does
 * not dim and lock before the next player's entry. The lock is let go when `on` stops holding and
 * while the page is hidden, as the browser lets it go by itself then, and asked for again once the
 * page is shown. A browser with no way to keep the screen lit, or one that refuses, is left alone
 * with nothing said, since the app works the same without it.
 */
export const useAwake = (on: boolean): void => {
    useEffect(() => {
        if (!on || !('wakeLock' in navigator)) return undefined;
        let lock: WakeLockSentinel | null = null;
        let left = false;
        const letGo = () => {
            lock?.release().catch(() => undefined);
            lock = null;
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
                    if (left) granted.release().catch(() => undefined);
                    else lock = granted;
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
