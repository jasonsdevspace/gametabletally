import { GAMES } from '@gametabletally/scoring';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';

import type { SavedPlayer } from '../store/format.js';
import { BLOCKED_DATABASE, openStore, type Store } from '../store/store.js';
import { AppFrame } from './AppFrame.js';
import { NewGame } from './NewGame.js';

/* The new game screen in the app's frame, over a database in memory. */

const player = (id: string, name: string, removed = false): SavedPlayer => ({
    id,
    name,
    added: '2026-11-01T10:00:00Z',
    removed,
});

/**
 * A database in memory holding the players given, a way to open it as the screen does, and a
 * promise that settles once the screen has first read it and let it go.
 */
const database = async (players: readonly SavedPlayer[]) => {
    const factory = new IDBFactory();
    const store = await openStore(factory);
    for (const one of players) await store.savePlayer(one);
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

/** The screen at an address, its ids made in order, and where it went once a game started. */
const draw = async (
    players: readonly SavedPlayer[] = [player('ann', 'Ann'), player('ben', 'Ben')],
    address = '/new/?game=skyjo'
) => {
    window.history.replaceState(null, '', address);
    const { open, read } = await database(players);
    const went: string[] = [];
    let made = 0;
    render(
        <AppFrame screen="new" title="New game">
            <NewGame
                open={open}
                newId={() => `id-${String((made += 1))}`}
                now={() => new Date('2026-11-15T09:00:00Z')}
                askToKeep={() => Promise.resolve()}
                go={(href) => {
                    went.push(href);
                }}
            />
        </AppFrame>
    );
    await act(() => read);
    return { open, went };
};

const seated = () =>
    within(screen.getByRole('list', { name: 'Players, in seat order' }))
        .getAllByRole('listitem')
        .map((row) => row.querySelector('.dk-row-title')?.textContent);

const addByName = (name: string) => {
    fireEvent.change(screen.getByRole('textbox', { name: "A new player's name" }), {
        target: { value: name },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
};

/** The screen's own status line, apart from the frame's toast. */
const status = () => within(screen.getByRole('main')).getByRole('status', { hidden: true });

/** Waits for the kit's status line to say the words, which it does a moment after it is told. */
const heard = (line: HTMLElement, words: string) =>
    waitFor(() => {
        expect(line).toHaveTextContent(words);
    });

afterEach(() => {
    window.history.replaceState(null, '', '/');
});

describe('the new game screen', () => {
    it('offers the games as one named group of radios, the linked game chosen', async () => {
        await draw([], '/new/?game=wizard');
        const games = screen.getByRole('radiogroup', { name: 'Game' });
        const radios = within(games).getAllByRole('radio');
        expect(radios).toHaveLength(GAMES.length);
        expect(within(games).getByRole('radio', { name: /^Wizard/ })).toBeChecked();
        expect(within(games).getByRole('radio', { name: /^Skyjo/ })).not.toBeChecked();
        fireEvent.click(within(games).getByRole('radio', { name: /^Flip 7/ }));
        expect(within(games).getByRole('radio', { name: /^Flip 7/ })).toBeChecked();
    });

    it('chooses no game when the link names none it knows', async () => {
        await draw([], '/new/?game=chess');
        expect(screen.getAllByRole('radio').filter((radio) => radio.matches(':checked'))).toEqual(
            []
        );
        expect(screen.getByText('Choose a game, then add its players.')).toBeVisible();
    });

    it('offers the saved players but not a removed one, and seats one pressed', async () => {
        await draw([player('ann', 'Ann'), player('ben', 'Ben'), player('old', 'Old', true)]);
        const saved = screen.getByRole('group', { name: 'Saved players' });
        expect(
            within(saved)
                .getAllByRole('button')
                .map((button) => button.textContent)
        ).toEqual(['Add Ann', 'Add Ben']);
        fireEvent.click(within(saved).getByRole('button', { name: 'Add Ben' }));
        expect(seated()).toEqual(['Ben']);
        expect(within(saved).queryByRole('button', { name: 'Add Ben' })).toBeNull();
        await heard(status(), 'Ben takes seat 1.');
        // Focus moves on to the next saved player, since the one pressed is gone.
        expect(within(saved).getByRole('button', { name: 'Add Ann' })).toHaveFocus();
    });

    it('saves a name typed as a new player and seats them', async () => {
        const { open } = await draw([player('ann', 'Ann')]);
        addByName('  Cat  ');
        await waitFor(() => {
            expect(seated()).toEqual(['Cat']);
        });
        expect(screen.getByRole('textbox', { name: "A new player's name" })).toHaveValue('');
        const store = await open();
        expect(await store.players()).toContainEqual({
            id: 'id-1',
            name: 'Cat',
            added: '2026-11-15T09:00:00.000Z',
            removed: false,
        });
        store.close();
    });

    it('brings back a removed player by their name, rather than adding another', async () => {
        const { open } = await draw([player('old', 'Dot', true)]);
        addByName('dot');
        await waitFor(() => {
            expect(seated()).toEqual(['Dot']);
        });
        const store = await open();
        expect(await store.players()).toEqual([player('old', 'Dot')]);
        store.close();
    });

    it('says why a name is not added, beside the field', async () => {
        await draw();
        const field = screen.getByRole('textbox', { name: "A new player's name" });
        addByName('   ');
        expect(await screen.findByText("Enter the player's name.")).toBeVisible();
        expect(field).toHaveAttribute('aria-invalid', 'true');
        expect(field).toHaveAccessibleDescription(/^Error: ?Enter the player's name\.$/);
        fireEvent.click(screen.getByRole('button', { name: 'Add Ann' }));
        addByName('ANN');
        expect(await screen.findByText('Ann has a seat already.')).toBeVisible();
        expect(seated()).toEqual(['Ann']);
    });

    it('moves a seat up and down, says its new place and keeps focus on the button', async () => {
        await draw([player('ann', 'Ann'), player('ben', 'Ben'), player('cat', 'Cat')]);
        for (const name of ['Ann', 'Ben', 'Cat'])
            fireEvent.click(screen.getByRole('button', { name: `Add ${name}` }));
        expect(screen.getByRole('button', { name: 'Move Ann up' })).toHaveAttribute(
            'aria-disabled',
            'true'
        );
        expect(screen.getByRole('button', { name: 'Move Cat down' })).toHaveAttribute(
            'aria-disabled',
            'true'
        );
        const down = screen.getByRole('button', { name: 'Move Ann down' });
        fireEvent.click(down);
        expect(seated()).toEqual(['Ben', 'Ann', 'Cat']);
        await heard(status(), 'Ann moves to seat 2.');
        expect(screen.getByRole('button', { name: 'Move Ann down' })).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: 'Move Cat up' }));
        expect(seated()).toEqual(['Ben', 'Cat', 'Ann']);
        await heard(status(), 'Cat moves to seat 2.');
        // A move past the first seat does nothing.
        fireEvent.click(screen.getByRole('button', { name: 'Move Ben up' }));
        expect(seated()).toEqual(['Ben', 'Cat', 'Ann']);
    });

    it('says the same words again when they are said twice', async () => {
        await draw();
        fireEvent.click(screen.getByRole('button', { name: 'Add Ann' }));
        await heard(status(), 'Ann takes seat 1.');
        fireEvent.click(screen.getByRole('button', { name: 'Remove Ann' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add Ann' }));
        // The line is emptied before the words are put in again, so they are heard again.
        expect(status()).toHaveTextContent('');
        await heard(status(), 'Ann takes seat 1.');
    });

    it('removes a seat and moves focus to the seat that took its place', async () => {
        await draw();
        fireEvent.click(screen.getByRole('button', { name: 'Add Ann' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add Ben' }));
        fireEvent.click(screen.getByRole('button', { name: 'Remove Ann' }));
        expect(seated()).toEqual(['Ben']);
        await heard(status(), 'Ann is off the seats.');
        expect(screen.getByRole('button', { name: 'Remove Ben' })).toHaveFocus();
        fireEvent.click(screen.getByRole('button', { name: 'Remove Ben' }));
        expect(screen.queryByRole('list', { name: 'Players, in seat order' })).toBeNull();
        expect(screen.getByText(/No one is seated yet/)).toBeVisible();
        expect(screen.getByRole('textbox', { name: "A new player's name" })).toHaveFocus();
    });

    it('keeps the start button off, saying how many the game takes, until enough are seated', async () => {
        const { went } = await draw([player('ann', 'Ann')]);
        const dock = screen.getByRole('region', { name: 'Actions' });
        const start = within(dock).getByRole('button', { name: 'Start the game' });
        expect(start).toHaveAttribute('aria-disabled', 'true');
        expect(start).toHaveAccessibleDescription('Skyjo takes 2 players or more. Add 2 more.');
        fireEvent.click(screen.getByRole('button', { name: 'Add Ann' }));
        expect(start).toHaveAccessibleDescription('Skyjo takes 2 players or more. Add 1 more.');
        fireEvent.click(start);
        await act(() => Promise.resolve());
        expect(went).toEqual([]);
    });

    it('starts the game under its newest rule set, at the first seat, and opens it', async () => {
        const { open, went } = await draw();
        fireEvent.click(screen.getByRole('button', { name: 'Add Ben' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add Ann' }));
        const start = screen.getByRole('button', { name: 'Start the game' });
        expect(start).not.toHaveAttribute('aria-disabled');
        expect(start).not.toHaveAttribute('aria-describedby');
        fireEvent.click(start);
        await waitFor(() => {
            expect(went).toEqual(['/game/?id=id-1']);
        });
        const store = await open();
        const game = await store.game('id-1');
        store.close();
        expect(game).toMatchObject({
            game: 'skyjo',
            rules: GAMES.find(({ id }) => id === 'skyjo')?.rules,
            options: {},
            players: ['ben', 'ann'],
            rounds: [],
            draft: { index: 0, step: { player: 'ben' } },
            started: '2026-11-15T09:00:00.000Z',
        });
    });

    it('opens the started game in the new game screen’s place, so Back does not start it again', async () => {
        window.history.replaceState(null, '', '/new/?game=skyjo');
        const { open, read } = await database([player('ann', 'Ann'), player('ben', 'Ben')]);
        render(
            <AppFrame screen="new" title="New game">
                <NewGame open={open} askToKeep={() => Promise.resolve()} />
            </AppFrame>
        );
        await act(() => read);
        const entries = window.history.length;
        fireEvent.click(screen.getByRole('button', { name: 'Add Ann' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add Ben' }));
        fireEvent.click(screen.getByRole('button', { name: 'Start the game' }));
        await waitFor(() => {
            expect(window.location.pathname).toBe('/game/');
        });
        expect(window.history.length).toBe(entries);
    });

    it('saves a typed name once, however quickly it is added twice', async () => {
        const { open } = await draw([player('ann', 'Ann')]);
        const field = screen.getByRole('textbox', { name: "A new player's name" });
        fireEvent.change(field, { target: { value: 'Cat' } });
        const form = field.closest('form') ?? document.body;
        fireEvent.submit(form);
        fireEvent.submit(form);
        await waitFor(() => {
            expect(seated()).toEqual(['Cat']);
        });
        await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
        expect(seated()).toEqual(['Cat']);
        const store = await open();
        expect((await store.players()).map(({ name }) => name)).toEqual(['Ann', 'Cat']);
        store.close();
    });

    it('adds no name before the saved players are read, so none is saved twice', async () => {
        window.history.replaceState(null, '', '/new/?game=skyjo');
        const { open } = await database([player('ann', 'Ann')]);
        let release: () => void = () => undefined;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        let opened = 0;
        const slow = async (): Promise<Store> => {
            opened += 1;
            if (opened === 1) await held;
            return open();
        };
        render(<NewGame open={slow} />);
        addByName('Ann');
        expect(
            await screen.findByText('Your saved players are still being read. Try again.')
        ).toBeVisible();
        release();
        expect(await screen.findByRole('button', { name: 'Add Ann' })).toBeVisible();
        const store = await open();
        expect(await store.players()).toEqual([player('ann', 'Ann')]);
        store.close();
    });

    it('says the seat a typed name takes as it is when the save is answered', async () => {
        window.history.replaceState(null, '', '/new/?game=skyjo');
        const { open, read } = await database([player('ann', 'Ann')]);
        let release: () => void = () => undefined;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        const slowSave = async (): Promise<Store> => {
            const store = await open();
            return {
                ...store,
                savePlayer: async (one) => {
                    await held;
                    await store.savePlayer(one);
                },
            };
        };
        render(
            <AppFrame screen="new" title="New game">
                <NewGame open={slowSave} newId={() => 'cat'} />
            </AppFrame>
        );
        await act(() => read);
        addByName('Cat');
        fireEvent.click(screen.getByRole('button', { name: 'Add Ann' }));
        await act(() => {
            release();
            return held;
        });
        await waitFor(() => {
            expect(seated()).toEqual(['Ann', 'Cat']);
        });
        await heard(status(), 'Cat takes seat 2.');
    });

    it('says why a game was not started beside the start button', async () => {
        window.history.replaceState(null, '', '/new/?game=skyjo');
        const { open, read } = await database([player('ann', 'Ann'), player('ben', 'Ben')]);
        const refusing = async (): Promise<Store> => ({
            ...(await open()),
            saveGame: () => Promise.reject(new Error('The phone is out of room.')),
        });
        render(
            <AppFrame screen="new" title="New game">
                <NewGame open={refusing} askToKeep={() => Promise.resolve()} go={() => undefined} />
            </AppFrame>
        );
        await act(() => read);
        fireEvent.click(screen.getByRole('button', { name: 'Add Ann' }));
        fireEvent.click(screen.getByRole('button', { name: 'Add Ben' }));
        fireEvent.click(screen.getByRole('button', { name: 'Start the game' }));
        const dock = screen.getByRole('region', { name: 'Actions' });
        expect(await within(dock).findByRole('alert')).toHaveTextContent(/./);
    });

    it("says why the saved players could not be read, in the store's own words", async () => {
        window.history.replaceState(null, '', '/new/?game=skyjo');
        render(<NewGame open={() => Promise.reject(new Error(BLOCKED_DATABASE))} />);
        expect(await screen.findByRole('alert')).toHaveTextContent(BLOCKED_DATABASE);
    });
});
