import { GAMES } from '@gametabletally/scoring';
import { act, render, screen, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { openPlay } from '../play/play.js';
import { BLOCKED_DATABASE, openStore } from '../store/store.js';
import { NOT_AFFILIATED } from '../website/Website.js';
import { PlayStart } from './PlayStart.js';

/* The start screen over a database in memory, with a game in play or none. */

/**
 * A database in memory, opened as the screen opens it, and a promise that settles once the screen
 * has read it and let it go, so a test waits for the read rather than for a while.
 */
const database = async (withGame: boolean) => {
    const factory = new IDBFactory();
    const store = await openStore(factory);
    await store.savePlayer({
        id: 'ann',
        name: 'Ann',
        added: '2026-11-01T10:00:00Z',
        removed: false,
    });
    await store.savePlayer({
        id: 'ben',
        name: 'Ben',
        added: '2026-11-01T10:01:00Z',
        removed: false,
    });
    if (withGame)
        await openPlay(store, undefined, () => Promise.resolve()).start({
            id: 'g-1',
            game: 'skyjo',
            rules: 1,
            options: {},
            players: ['ann', 'ben'],
        });
    store.close();
    const settled: { done?: () => void } = {};
    const read = new Promise<void>((resolve) => {
        settled.done = resolve;
    });
    const open = async () => {
        const opened = await openStore(factory);
        return {
            ...opened,
            close: () => {
                opened.close();
                settled.done?.();
            },
        };
    };
    return { open, read };
};

describe('the start screen', () => {
    it('offers to continue the game in play, naming the game and whose turn it is', async () => {
        const { open } = await database(true);
        render(<PlayStart open={open} />);
        const heading = await screen.findByRole('heading', { name: 'Game in play' });
        const card = within(heading.parentElement ?? document.body);
        expect(card.getByText('Skyjo')).toBeVisible();
        expect(card.getByText('Round 1')).toBeVisible();
        expect(card.getByText("Ann's score is next.")).toBeVisible();
        expect(card.getByRole('link', { name: 'Continue the game' })).toHaveAttribute(
            'href',
            '/game/?id=g-1'
        );
    });

    it('offers only to start a game when none is in play, each game named in plain text', async () => {
        const { open, read } = await database(false);
        render(<PlayStart open={open} />);
        const games = within(screen.getByRole('list', { name: 'Start a new game' }));
        expect(games.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(
            GAMES.map((game) => `/new/?game=${game.id}`)
        );
        for (const game of GAMES) expect(games.getByText(game.name)).toBeVisible();
        await act(() => read);
        expect(screen.queryByRole('heading', { name: 'Game in play' })).toBeNull();
    });

    it("says why the games could not be read, in the store's own words", async () => {
        render(<PlayStart open={() => Promise.reject(new Error(BLOCKED_DATABASE))} />);
        expect(await screen.findByRole('alert')).toHaveTextContent(BLOCKED_DATABASE);
    });

    it('reads the game in play again when the app comes back to the front', async () => {
        const { open } = await database(false);
        let opened = 0;
        render(
            <PlayStart
                open={() => {
                    opened += 1;
                    return open();
                }}
            />
        );
        expect(opened).toBe(1);
        act(() => {
            window.dispatchEvent(new Event('pageshow'));
        });
        expect(opened).toBe(2);
    });

    it('says the app is not affiliated with the games’ publishers', () => {
        render(<PlayStart open={() => Promise.reject(new Error('No database here.'))} />);
        expect(screen.getByText(NOT_AFFILIATED)).toBeVisible();
    });
});
