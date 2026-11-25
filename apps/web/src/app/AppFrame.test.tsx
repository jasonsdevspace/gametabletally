import { afterEach, describe, expect, it, vi } from 'vitest';

import { AppFrame, currentOf, Dock, useToast } from './AppFrame.js';
import { act, appLine, render, screen, waitFor, within } from './render.testing.js';

/*
 * The frame every screen for keeping score sits in: its one heading, its tab bar and the place
 * its toast is shown in.
 */

const tabs = () => within(screen.getByRole('navigation', { name: 'Sections' }));

describe("the app's frame", () => {
    it("names its main region by the screen's heading, so focus arriving there says the screen", () => {
        render(<AppFrame screen="players" title="Players" />);
        expect(screen.getByRole('main', { name: 'Players' })).toBeInTheDocument();
    });

    it("holds the screen's name as its one top heading, in the bar", () => {
        render(<AppFrame screen="play" title="Play" />);
        expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([
            'Play',
        ]);
        expect(screen.getByRole('banner')).toContainElement(
            screen.getByRole('heading', { level: 1 })
        );
    });

    it('reaches play, history and players, and marks the one the visitor is in', () => {
        render(<AppFrame screen="history" title="History" />);
        expect(
            tabs()
                .getAllByRole('link')
                .map((link) => [link.textContent, link.getAttribute('href')])
        ).toEqual([
            ['Play', '/play/'],
            ['History', '/history/'],
            ['Players', '/players/'],
        ]);
        expect(tabs().getByRole('link', { name: 'History' })).toHaveAttribute(
            'aria-current',
            'page'
        );
        expect(tabs().getByRole('link', { name: 'Play' })).not.toHaveAttribute('aria-current');
    });

    it('marks the section a screen sits beneath, and nothing for an address of the website', () => {
        expect(currentOf('play', 'play')).toBe('page');
        expect(currentOf('play', 'game')).toBe('true');
        expect(currentOf('players', 'player')).toBe('true');
        expect(currentOf('history', 'game')).toBeUndefined();
        expect(currentOf('play', 'about')).toBeUndefined();
        expect(currentOf('play', 'constructor')).toBeUndefined();
    });

    it('marks the history for a recap opened from it, and play for one reached as a game ends', () => {
        expect(currentOf('history', 'recap', '?id=g-1&from=history')).toBe('true');
        expect(currentOf('play', 'recap', '?id=g-1&from=history')).toBeUndefined();
        expect(currentOf('play', 'recap', '?id=g-1')).toBe('true');
        expect(currentOf('history', 'recap', '?id=g-1')).toBeUndefined();
        render(<AppFrame screen="recap" title="Recap" search="?id=g-1&from=history" />);
        expect(tabs().getByRole('link', { name: 'History' })).toHaveAttribute(
            'aria-current',
            'true'
        );
        expect(tabs().getByRole('link', { name: 'Play' })).not.toHaveAttribute('aria-current');
    });

    it('holds one place for a toast, its status line on the page before any toast is shown', () => {
        render(<AppFrame screen="play" title="Play" />);
        const statuses = screen.getAllByRole('status').filter((one) => one !== appLine());
        expect(statuses).toHaveLength(1);
        expect(statuses[0]).toHaveTextContent('');
    });

    it("shows a screen's toast in that place, said on its status line", async () => {
        const Saver = () => {
            const show = useToast();
            return (
                <button type="button" onClick={() => show('Round 3 saved.')}>
                    Save
                </button>
            );
        };
        render(
            <AppFrame screen="game" title="Game in play">
                <Saver />
            </AppFrame>
        );
        act(() => {
            screen.getByRole('button', { name: 'Save' }).click();
        });
        await waitFor(() => {
            expect(document.querySelector('.dk-app-toast [role="status"]')).toHaveTextContent(
                'Round 3 saved.'
            );
        });
    });

    it('leaves no timer running once a frame showing a toast is taken away', async () => {
        // Only the page's timers are faked, so the frame each test waits for once it is done runs.
        vi.useFakeTimers({
            toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
        });
        const Saver = () => {
            const show = useToast();
            return (
                <button type="button" onClick={() => show('Round 3 saved.')}>
                    Save
                </button>
            );
        };
        const { unmount } = render(
            <AppFrame screen="game" title="Game in play">
                <Saver />
            </AppFrame>
        );
        act(() => {
            screen.getByRole('button', { name: 'Save' }).click();
        });
        act(() => {
            vi.advanceTimersByTime(150);
        });
        expect(document.querySelector('.dk-app-toast [role="status"]')).toHaveTextContent(
            'Round 3 saved.'
        );
        unmount();
        // Microtasks run, as the kit takes the toast down in one, and the faked clock stands still,
        // so the toast's wait before it leaves, still set, is counted rather than run out.
        await act(async () => {
            await Promise.resolve();
        });
        expect(vi.getTimerCount()).toBe(0);
    });

    it("draws a screen's dock in the frame, after the body, and none for a screen with no dock", () => {
        const { rerender } = render(<AppFrame screen="play" title="Play" />);
        expect(screen.queryByRole('region', { name: 'Actions' })).toBeNull();
        rerender(
            <AppFrame screen="new" title="New game">
                <p>The body</p>
                <Dock>
                    <button type="button">Start the game</button>
                </Dock>
            </AppFrame>
        );
        const dock = screen.getByRole('region', { name: 'Actions' });
        expect(within(dock).getByRole('button', { name: 'Start the game' })).toBeVisible();
        expect(screen.getByRole('main')).not.toContainElement(dock);
        rerender(<AppFrame screen="play" title="Play" />);
        expect(screen.queryByRole('region', { name: 'Actions' })).toBeNull();
    });
});

afterEach(() => {
    vi.useRealTimers();
});
