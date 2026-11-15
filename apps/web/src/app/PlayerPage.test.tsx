import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';

import { openPlay } from '../play/play.js';
import type { SavedPlayer } from '../store/format.js';
import { openStore } from '../store/store.js';
import { AppFrame } from './AppFrame.js';
import { PlayerPage } from './PlayerPage.js';
import { PLAYERS_CHANGED } from './players.js';

/* A player's own page in the app's frame, over a database in memory. */

const player = (id: string, name: string, removed = false): SavedPlayer => ({
    id,
    name,
    added: '2026-11-01T10:00:00Z',
    removed,
});

/** A database with Ann, who has played a game with Ben, and Cat, who has played none. */
const draw = async (id: string) => {
    window.history.replaceState(null, '', `/player/?id=${id}`);
    const factory = new IDBFactory();
    const store = await openStore(factory);
    for (const one of [player('ann', 'Ann'), player('ben', 'Ben'), player('cat', 'Cat')])
        await store.savePlayer(one);
    await openPlay(store, undefined, () => Promise.resolve()).start({
        id: 'g-1',
        game: 'skyjo',
        rules: 1,
        options: {},
        players: ['ann', 'ben'],
    });
    store.close();
    const open = () => openStore(factory);
    const went: string[] = [];
    render(
        <AppFrame screen="player" title="Player">
            <PlayerPage
                open={open}
                go={(href) => {
                    went.push(href);
                }}
            />
        </AppFrame>
    );
    return { open, went };
};

const players = async (open: () => ReturnType<typeof openStore>) => {
    const store = await open();
    const saved = await store.players();
    store.close();
    return saved;
};

const nameField = () => screen.getByRole('textbox', { name: 'Name' });

/** The frame's toast, which shows its message and its Undo. */
const toast = () => within(document.querySelector<HTMLElement>('.dk-toast') ?? document.body);

afterEach(() => {
    window.history.replaceState(null, '', '/');
});

describe("a player's page", () => {
    it('names the player and how many games they have played', async () => {
        await draw('ann');
        expect(await screen.findByRole('heading', { name: 'Ann' })).toBeVisible();
        expect(screen.getByText('1 game played.')).toBeVisible();
        expect(nameField()).toHaveValue('Ann');
    });

    it('renames the player as the field is left, and says so', async () => {
        const { open } = await draw('ann');
        await screen.findByRole('heading', { name: 'Ann' });
        fireEvent.change(nameField(), { target: { value: ' Annie ' } });
        fireEvent.blur(nameField());
        expect(await screen.findByRole('heading', { name: 'Annie' })).toBeVisible();
        expect(within(screen.getByRole('main')).getByRole('status')).toHaveTextContent(
            'Saved as Annie.'
        );
        expect((await players(open)).find(({ id }) => id === 'ann')?.name).toBe('Annie');
    });

    it('refuses an empty name and one already taken beside the field, saving nothing', async () => {
        const { open } = await draw('ann');
        await screen.findByRole('heading', { name: 'Ann' });
        fireEvent.change(nameField(), { target: { value: '  ' } });
        fireEvent.blur(nameField());
        expect(await screen.findByText("Enter the player's name.")).toBeVisible();
        expect(nameField()).toHaveAttribute('aria-invalid', 'true');
        fireEvent.change(nameField(), { target: { value: 'BEN' } });
        fireEvent.submit(nameField());
        expect(await screen.findByText('A player is already named Ben.')).toBeVisible();
        expect((await players(open)).find(({ id }) => id === 'ann')?.name).toBe('Ann');
    });

    it('removes a player at once, goes to the players screen and offers Undo, which puts them back as they were', async () => {
        const { open, went } = await draw('cat');
        fireEvent.click(await screen.findByRole('button', { name: 'Remove Cat' }));
        await waitFor(() => {
            expect(went).toEqual(['/players/']);
        });
        // Cat had played no game, so the store deleted them.
        expect((await players(open)).map(({ id }) => id)).toEqual(['ann', 'ben']);
        expect(toast().getByText('Cat removed.')).toBeInTheDocument();
        let changed = false;
        window.addEventListener(
            PLAYERS_CHANGED,
            () => {
                changed = true;
            },
            { once: true }
        );
        fireEvent.click(toast().getByRole('button', { name: 'Undo' }));
        await waitFor(() => {
            expect(changed).toBe(true);
        });
        expect(await players(open)).toContainEqual(player('cat', 'Cat'));
    });

    it('keeps a removed player who has played, marked removed, and Undo takes the mark away', async () => {
        const { open } = await draw('ann');
        fireEvent.click(await screen.findByRole('button', { name: 'Remove Ann' }));
        await waitFor(async () => {
            expect((await players(open)).find(({ id }) => id === 'ann')?.removed).toBe(true);
        });
        fireEvent.click(toast().getByRole('button', { name: 'Undo' }));
        await waitFor(async () => {
            expect((await players(open)).find(({ id }) => id === 'ann')).toEqual(
                player('ann', 'Ann')
            );
        });
    });

    it('says there is no player at an address that names none, with the way to all players', async () => {
        await draw('nobody');
        expect(await screen.findByText(/There is no player at this address/)).toBeVisible();
        expect(
            within(screen.getByRole('main')).getByRole('link', { name: 'All players' })
        ).toHaveAttribute('href', '/players/');
    });

    it('carries a way back to all players in the bar', async () => {
        await draw('ann');
        await act(() => Promise.resolve());
        expect(
            within(screen.getByRole('banner')).getByRole('link', { name: 'All players' })
        ).toHaveAttribute('href', '/players/');
    });
});
