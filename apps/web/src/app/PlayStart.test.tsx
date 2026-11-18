import { GAMES } from '@gametabletally/scoring';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
    // Each read of the games settles the next of these, so a test waits for a read itself.
    const reads: (() => void)[] = [];
    const nextRead = () =>
        new Promise<void>((resolve) => {
            reads.push(resolve);
        });
    const open = async () => {
        const opened = await openStore(factory);
        return {
            ...opened,
            games: async () => {
                const games = await opened.games();
                queueMicrotask(() => reads.shift()?.());
                return games;
            },
        };
    };
    return { open, nextRead, factory };
};

describe('the start screen', () => {
    it('offers to continue the game in play, naming the game and whose turn it is', async () => {
        const { open } = await database(true);
        render(<PlayStart open={open} />);
        const section = await screen.findByRole('region', { name: 'Game in play' });
        const card = within(section);
        expect(card.getByText('Skyjo')).toBeVisible();
        expect(card.getByText('Round 1')).toBeVisible();
        expect(card.getByText("Ann's score is next.")).toBeVisible();
        expect(
            card.getByRole('link', { name: 'Continue the game of Skyjo, round 1' })
        ).toHaveAttribute('href', '/game/?id=g-1');
        expect(
            card.getByRole('button', { name: 'Discard the game of Skyjo, round 1' })
        ).toBeVisible();
    });

    it('offers only to start a game when none is in play, each game named in plain text', async () => {
        const { open, nextRead } = await database(false);
        const read = nextRead();
        render(<PlayStart open={open} />);
        const games = within(screen.getByRole('list', { name: 'Start a new game' }));
        expect(games.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(
            GAMES.map((game) => `/new/?game=${game.id}`)
        );
        for (const game of GAMES) expect(games.getByText(game.name)).toBeVisible();
        await act(() => read);
        expect(screen.queryByRole('region', { name: /in play/ })).toBeNull();
    });

    it("says why the games could not be read, in the store's own words", async () => {
        render(<PlayStart open={() => Promise.reject(new Error(BLOCKED_DATABASE))} />);
        expect(await screen.findByRole('alert')).toHaveTextContent(BLOCKED_DATABASE);
    });

    it('reads the games in play again when the app comes back to the front', async () => {
        const { open, factory, nextRead } = await database(false);
        const first = nextRead();
        render(<PlayStart open={open} />);
        await act(() => first);
        expect(screen.queryByText('Flip 7', { selector: 'strong' })).toBeNull();
        // Another tab starts a game meanwhile.
        const other = await openStore(factory);
        await openPlay(other, undefined, () => Promise.resolve()).start({
            id: 'g-2',
            game: 'flip-7',
            rules: 1,
            options: {},
            players: ['ann', 'ben'],
        });
        other.close();
        act(() => {
            window.dispatchEvent(new Event('pageshow'));
        });
        expect(await screen.findByText('Flip 7', { selector: 'strong' })).toBeVisible();
    });

    it('lists two games in play, each to continue or discard, and takes a discarded one away at once', async () => {
        const { open, factory } = await database(true);
        const other = await openStore(factory);
        await openPlay(other, undefined, () => Promise.resolve()).start({
            id: 'g-2',
            game: 'flip-7',
            rules: 1,
            options: {},
            players: ['ann', 'ben'],
        });
        other.close();
        render(<PlayStart open={open} />);
        const section = await screen.findByRole('region', { name: 'Games in play' });
        expect(within(section).getAllByRole('listitem')).toHaveLength(2);
        fireEvent.click(
            within(section).getByRole('button', { name: 'Discard the game of Skyjo, round 1' })
        );
        await waitFor(() => {
            expect(screen.queryByText('Skyjo', { selector: 'strong' })).toBeNull();
        });
        expect(screen.getByRole('region', { name: 'Game in play' })).toBeTruthy();
    });

    it('tries a read that failed again when the app comes back to the front', async () => {
        const { open } = await database(true);
        let tries = 0;
        render(
            <PlayStart
                open={() => {
                    tries += 1;
                    return tries === 1 ? Promise.reject(new Error(BLOCKED_DATABASE)) : open();
                }}
            />
        );
        expect(await screen.findByRole('alert')).toHaveTextContent(BLOCKED_DATABASE);
        act(() => {
            window.dispatchEvent(new Event('pageshow'));
        });
        expect(await screen.findByRole('region', { name: 'Game in play' })).toBeTruthy();
        expect(screen.queryByRole('alert')).toBeNull();
    });

    it('offers a round being changed to continue or let go, never to discard its game', async () => {
        const { open, factory } = await database(false);
        const other = await openStore(factory);
        const model = openPlay(other, undefined, () => Promise.resolve());
        await model.start({
            id: 'g-3',
            game: 'flip-7',
            rules: 1,
            options: {},
            players: ['ann', 'ben', 'cat'],
        });
        for (const numbers of [[5], [7], [9]])
            await model.enter('g-3', { numbers, modifiers: [], bust: false });
        await model.saveRound('g-3');
        await model.reopen('g-3', 0);
        other.close();
        render(<PlayStart open={open} />);
        const card = within(await screen.findByRole('region', { name: 'Game in play' }));
        expect(card.getByText('Round 1 is being changed.')).toBeVisible();
        expect(
            card.getByRole('link', { name: 'Continue changing round 1 of Flip 7' })
        ).toHaveAttribute('href', '/game/?id=g-3&round=1');
        expect(card.queryByRole('button', { name: /Discard/ })).toBeNull();
        fireEvent.click(
            card.getByRole('button', { name: 'Cancel the change to round 1 of Flip 7' })
        );
        await waitFor(() => {
            expect(screen.queryByRole('region', { name: /in play/ })).toBeTruthy();
            expect(screen.queryByText('Round 1 is being changed.')).toBeNull();
        });
    });

    it('says the app is not affiliated with the games’ publishers', () => {
        render(<PlayStart open={() => Promise.reject(new Error('No database here.'))} />);
        expect(screen.getByText(NOT_AFFILIATED)).toBeVisible();
    });
});
