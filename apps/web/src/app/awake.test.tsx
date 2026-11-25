import { afterEach, describe, expect, it } from 'vitest';

import { AppFrame } from './AppFrame.js';
import { useKeepAwake } from './awake.js';
import { answered, noWakeLock, setShown, wakeLockBrowser } from './awake.testing.js';
import { appLine, render, screen } from './render.testing.js';

/*
 * Keeping the screen awake while a game is in play, with the browser's Screen Wake Lock interface
 * stubbed, and a screen that says whether its game is in play standing in for the game's screens.
 */

/** A screen that holds the screen awake while its game is in play. */
const Game = ({ inPlay }: { readonly inPlay: boolean }) => {
    useKeepAwake(inPlay);
    return null;
};

const frameAt = (screenName: string, inPlay: boolean | null = null) => (
    <AppFrame screen={screenName} search="?id=g-1" title={screenName}>
        {inPlay === null ? null : <Game key={screenName} inPlay={inPlay} />}
    </AppFrame>
);

afterEach(noWakeLock);

describe('keeping the screen awake', () => {
    it('asks while a game in play is open, and lets go once the game is left', async () => {
        const { request, locks } = wakeLockBrowser();
        const { rerender } = render(frameAt('game', true));
        await answered();
        expect(request).toHaveBeenCalledWith('screen');
        rerender(frameAt('history'));
        expect(locks[0]?.release).toHaveBeenCalledTimes(1);
        rerender(frameAt('scores', true));
        await answered();
        expect(request).toHaveBeenCalledTimes(2);
    });

    it("asks for nothing on a finished game's screens, or a screen not about a game", async () => {
        const { request } = wakeLockBrowser();
        const { rerender } = render(frameAt('game', false));
        rerender(frameAt('scores', false));
        rerender(frameAt('players'));
        await answered();
        expect(request).not.toHaveBeenCalled();
    });

    it('lets go while the page is hidden and asks again once it is shown', async () => {
        const { request, locks } = wakeLockBrowser();
        render(frameAt('game', true));
        await answered();
        setShown(false);
        expect(locks[0]?.release).toHaveBeenCalledTimes(1);
        expect(request).toHaveBeenCalledTimes(1);
        setShown(true);
        await answered();
        expect(request).toHaveBeenCalledTimes(2);
    });

    it('asks again when the browser lets go by itself while the game is shown', async () => {
        const { request, locks } = wakeLockBrowser();
        render(frameAt('game', true));
        await answered();
        locks[0]?.drop();
        await answered();
        expect(request).toHaveBeenCalledTimes(2);
    });

    it('lets go of a lock granted after the game was left', async () => {
        const { locks } = wakeLockBrowser();
        const { rerender } = render(frameAt('game', true));
        rerender(frameAt('play'));
        await answered();
        expect(locks[0]?.release).toHaveBeenCalledTimes(1);
    });

    it('shows nothing when the browser refuses', async () => {
        const { request } = wakeLockBrowser(true);
        render(frameAt('game', true));
        await answered();
        expect(request).toHaveBeenCalledTimes(1);
        expect(screen.queryByRole('alert')).toBeNull();
        expect(appLine()).toHaveTextContent('');
        expect(document.querySelector('.dk-app-toast [role="status"]')).toHaveTextContent('');
    });

    it('works the same in a browser with no way to keep the screen awake', async () => {
        render(frameAt('game', true));
        await answered();
        setShown(false);
        setShown(true);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('game');
        expect(screen.queryByRole('alert')).toBeNull();
    });
});
