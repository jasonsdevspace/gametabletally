import { GAMES } from '@gametabletally/scoring';
import { render, screen, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { openPlay } from '../play/play.js';
import { openStore } from '../store/store.js';
import { NOT_AFFILIATED } from '../website/Website.js';
import { PlayStart } from './PlayStart.js';

/* The start screen over a database in memory, with a game in play or none. */

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
    return () => openStore(factory);
};

describe('the start screen', () => {
    it('offers to continue the game in play, naming the game and whose turn it is', async () => {
        render(<PlayStart open={await database(true)} />);
        const card = within(await screen.findByRole('region', { name: 'Game in play' }));
        expect(card.getByText('Skyjo')).toBeVisible();
        expect(card.getByText('Round 1')).toBeVisible();
        expect(card.getByText("It is Ann's turn.")).toBeVisible();
        expect(card.getByRole('link', { name: 'Continue the game' })).toHaveAttribute(
            'href',
            '/game/?id=g-1'
        );
    });

    it('offers only to start a game when none is in play, each game named in plain text', async () => {
        render(<PlayStart open={await database(false)} />);
        const games = within(screen.getByRole('region', { name: 'Start a new game' }));
        expect(games.getAllByRole('link').map((link) => link.getAttribute('href'))).toEqual(
            GAMES.map((game) => `/new/?game=${game.id}`)
        );
        for (const game of GAMES) expect(games.getByText(game.name)).toBeVisible();
        // Given the database time to answer, there is still nothing to continue.
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(screen.queryByRole('region', { name: 'Game in play' })).toBeNull();
    });

    it('says the app is not affiliated with the games’ publishers', () => {
        render(<PlayStart open={() => Promise.reject(new Error('No database here.'))} />);
        expect(screen.getByText(NOT_AFFILIATED)).toBeVisible();
    });
});
