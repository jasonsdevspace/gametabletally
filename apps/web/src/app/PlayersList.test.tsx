import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { openPlay } from '../play/play.js';
import type { SavedPlayer } from '../store/format.js';
import { BLOCKED_DATABASE, openStore } from '../store/store.js';
import { playersChanged } from './players.js';
import { PlayersList } from './PlayersList.js';
import { act, fireEvent, render, screen, waitFor, within } from './render.testing.js';
import { heard, refused, refusedInPlace } from './status.testing.js';

/* The players screen over a database in memory. */

const player = (id: string, name: string, added: string, removed = false): SavedPlayer => ({
    id,
    name,
    added,
    removed,
});

/**
 * A database in memory holding the players given, with Ann in one game, a way to open it, and a
 * promise that settles once the screen has first read it and let it go.
 */
const database = async (players: readonly SavedPlayer[]) => {
    const factory = new IDBFactory();
    const store = await openStore(factory);
    for (const one of players) await store.savePlayer(one);
    if (players.some(({ id }) => id === 'ann'))
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

const SAVED = [
    player('ben', 'Ben', '2026-11-01T10:01:00Z'),
    player('ann', 'Ann', '2026-11-01T10:00:00Z'),
    player('old', 'Old', '2026-11-01T10:02:00Z', true),
];

const draw = async (players: readonly SavedPlayer[] = SAVED) => {
    const { open, read } = await database(players);
    render(
        <PlayersList open={open} newId={() => 'cat'} now={() => new Date('2026-11-15T09:00:00Z')} />
    );
    await act(() => read);
    return { open };
};

const rows = () =>
    within(screen.getByRole('list', { name: 'Players' }))
        .getAllByRole('link')
        .map((link) => [
            link.querySelector('.dk-row-title')?.textContent,
            link.getAttribute('href'),
        ]);

const addByName = (name: string) => {
    fireEvent.change(screen.getByRole('textbox', { name: "A new player's name" }), {
        target: { value: name },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
};

describe('the players screen', () => {
    it('lists every player not removed, in the order they were added, each leading to their page', async () => {
        await draw();
        expect(rows()).toEqual([
            ['Ann', '/player/?id=ann'],
            ['Ben', '/player/?id=ben'],
        ]);
        expect(screen.getByRole('link', { name: /^Ann, ?1 game$/ })).toBeVisible();
    });

    it('says what will appear and how to add a player when there is none', async () => {
        await draw([]);
        expect(screen.queryByRole('list', { name: 'Players' })).toBeNull();
        expect(screen.getByText(/^No players yet\./)).toHaveTextContent(
            'A player is saved the first time they sit down to a game'
        );
    });

    it('adds a player by name, saved and listed at once', async () => {
        const { open } = await draw();
        addByName(' Cat ');
        await heard(screen.getByRole('status', { hidden: true }), 'Cat added.');
        expect(rows().map(([name]) => name)).toEqual(['Ann', 'Ben', 'Cat']);
        const store = await open();
        expect(await store.players()).toContainEqual(
            player('cat', 'Cat', '2026-11-15T09:00:00.000Z')
        );
        store.close();
    });

    it('refuses an empty name and one already taken, saving nothing', async () => {
        const { open } = await draw();
        const field = screen.getByRole('textbox', { name: "A new player's name" });
        addByName('');
        await refusedInPlace(field, "Enter the player's name.");
        addByName('ben');
        await refusedInPlace(field, 'A player is already named Ben.');
        field.focus();
        fireEvent.submit(field);
        await refused(
            field,
            screen.getByRole('status', { hidden: true }),
            'A player is already named Ben.'
        );
        const store = await open();
        expect(await store.players()).toHaveLength(SAVED.length);
        store.close();
    });

    it('reads the players again when one is put back from elsewhere', async () => {
        const { open } = await draw();
        const store = await open();
        await store.savePlayer(player('old', 'Old', '2026-11-01T10:02:00Z'));
        store.close();
        act(() => {
            playersChanged();
        });
        await waitFor(() => {
            expect(rows().map(([name]) => name)).toEqual(['Ann', 'Ben', 'Old']);
        });
    });

    it("says why the players could not be read, in the store's own words", async () => {
        render(<PlayersList open={() => Promise.reject(new Error(BLOCKED_DATABASE))} />);
        await waitFor(() => {
            // Said as an error first, so the tone is not told by color alone.
            expect(screen.getByRole('alert')).toHaveTextContent(`Error: ${BLOCKED_DATABASE}`);
        });
    });

    it('lists a removed player brought back by name in their place, by the day they were added', async () => {
        await draw([
            player('ann', 'Ann', '2026-11-01T10:00:00Z', true),
            player('ben', 'Ben', '2026-11-01T10:01:00Z'),
        ]);
        addByName('ann');
        await waitFor(() => {
            expect(rows().map(([name]) => name)).toEqual(['Ann', 'Ben']);
        });
    });

    it('draws only the latest read, when an earlier one is answered after it', async () => {
        const { open } = await database(SAVED);
        let release: () => void = () => undefined;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        let opened = 0;
        const slowFirst = async () => {
            opened += 1;
            const store = await open();
            if (opened !== 1) return store;
            const before = await store.players();
            return {
                ...store,
                players: async () => {
                    await held;
                    return before;
                },
            };
        };
        render(<PlayersList open={slowFirst} />);
        // Old is put back, and the second read finds them while the first is still waiting.
        const store = await open();
        await store.savePlayer(player('old', 'Old', '2026-11-01T10:02:00Z'));
        store.close();
        act(() => {
            playersChanged();
        });
        await waitFor(() => {
            expect(rows().map(([name]) => name)).toEqual(['Ann', 'Ben', 'Old']);
        });
        await act(async () => {
            release();
            await held;
            await new Promise((resolve) => setTimeout(resolve, 20));
        });
        expect(rows().map(([name]) => name)).toEqual(['Ann', 'Ben', 'Old']);
    });
});
