import { render, screen } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { expect, it } from 'vitest';

import type { Play } from '../play/play.js';
import type { SavedGame } from '../store/format.js';
import { openStore, type Store } from '../store/store.js';
import { WithOpenedGame } from './opened-game.js';

/* How a screen about one game reads it, and lets its database go once the screen is left. */

const GAME: SavedGame = {
    id: 'g-1',
    game: 'flip-7',
    rules: 1,
    options: {},
    players: ['ann', 'ben'],
    rounds: [],
    draft: { index: 0, round: { entries: {}, out: [] }, step: { part: 'entry', player: 'ann' } },
    started: '2026-11-14T10:00:00Z',
    changed: '2026-11-14T10:00:00Z',
};

it('lets the database go only once a tap still being written when the screen is left is saved', async () => {
    window.history.replaceState(null, '', '/game/?id=g-1');
    const factory = new IDBFactory();
    const seeded = await openStore(factory);
    await seeded.saveGame(GAME);
    seeded.close();
    // A store whose saves wait to be let through, and which says when it is closed.
    const seen: { release?: () => void; play?: Play } = {};
    const gate = new Promise<void>((resolve) => {
        seen.release = resolve;
    });
    const events: string[] = [];
    const open = async (): Promise<Store> => {
        const store = await openStore(factory);
        return {
            ...store,
            saveGame: async (game) => {
                await gate;
                await store.saveGame(game);
                events.push('saved');
            },
            close: () => {
                events.push('closed');
                store.close();
            },
        };
    };
    const { unmount } = render(
        <WithOpenedGame open={open}>
            {(game) => {
                seen.play = game.play;
                return <p>Read</p>;
            }}
        </WithOpenedGame>
    );
    await screen.findByText('Read');
    const held = seen.play?.hold('g-1', { numbers: [8], modifiers: [], bust: false });
    unmount();
    await Promise.resolve();
    expect(events).toEqual([]);
    seen.release?.();
    await held;
    await seen.play?.settled();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(events).toEqual(['saved', 'closed']);
});
