import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen, waitFor, within } from '../app/render.testing.js';
import { FORMAT, FORMAT_VERSION, readFile, type SavedGame } from '../store/format.js';
import { DATABASE, GAMES, NEWER_DATABASE, openStore, type Store } from '../store/store.js';
import { Backup } from './Backup.js';

/*
 * The about page's part on the saved games, over a database in memory, with the browser's answer
 * and its download stood in for. A real download and a real file picker are the browser tests'.
 */

const game = (id: string, changed = '2026-11-04T09:00:00Z'): SavedGame => ({
    id,
    game: 'flip-7',
    rules: 1,
    options: {},
    players: ['p-ann'],
    rounds: [],
    draft: null,
    started: '2026-11-04T08:00:00Z',
    changed,
});

const ANN = { id: 'p-ann', name: 'Ann', added: '2026-11-01T10:00:00Z', removed: false };

/** A database in memory of its own, and a way to open it again, as the page does. */
const database = async (fill: (store: Store) => Promise<void> = () => Promise.resolve()) => {
    const factory = new IDBFactory();
    const store = await openStore(factory);
    await fill(store);
    store.close();
    return { factory, open: () => openStore(factory) };
};

const pick = (text: string) => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]');
    if (!input) throw new Error('no file picker');
    fireEvent.change(input, { target: { files: [new File([text], 'games.json')] } });
};

const said = () => within(screen.getByRole('region', { name: 'Your games' })).getByRole('status');

describe('saving and restoring the games', () => {
    it('says whether the browser will keep the games, and offers both once the games are open', async () => {
        const { open } = await database();
        render(<Backup open={open} kept={() => Promise.resolve(false)} />);
        expect(await screen.findByRole('button', { name: 'Save to a file' })).toBeVisible();
        expect(screen.getByRole('button', { name: 'Restore from a file' })).toBeVisible();
        expect(screen.getByText(/has not agreed to keep your games/)).toBeVisible();
    });

    it('saves every game to a file named for the day, one the app reads back', async () => {
        const { open } = await database(async (store) => {
            await store.savePlayer(ANN);
            await store.saveGame(game('g-1'));
        });
        const save = vi.fn<(name: string, text: string) => void>();
        render(
            <Backup
                open={open}
                kept={() => Promise.resolve(true)}
                now={() => new Date(2026, 10, 14, 20, 0)}
                save={save}
            />
        );
        (await screen.findByRole('button', { name: 'Save to a file' })).click();
        await waitFor(() => {
            expect(said()).toHaveTextContent(
                '1 game is ready in game-table-tally-2026-11-14.json.'
            );
        });
        const [name, text] = save.mock.calls[0] ?? ['', ''];
        expect(name).toBe('game-table-tally-2026-11-14.json');
        const file = readFile(text);
        expect(file).toMatchObject({ players: [ANN], games: [game('g-1')] });
    });

    it('restores what the phone does not hold, says how much, and adds nothing twice', async () => {
        const { open } = await database(async (store) => {
            await store.saveGame(game('g-1'));
        });
        render(<Backup open={open} kept={() => Promise.resolve(true)} />);
        await screen.findByRole('button', { name: 'Restore from a file' });
        const text = JSON.stringify({
            format: FORMAT,
            version: FORMAT_VERSION,
            exported: '2026-11-05T09:00:00Z',
            players: [ANN],
            games: [game('g-1'), game('g-2')],
        });
        pick(text);
        await waitFor(() => {
            expect(said()).toHaveTextContent('Restored 1 game and 1 player from the file.');
        });
        pick(text);
        await waitFor(() => {
            expect(said()).toHaveTextContent('Nothing was added.');
        });
        const store = await open();
        expect((await store.games()).map(({ id }) => id).sort()).toEqual(['g-1', 'g-2']);
        store.close();
    });

    it.each([
        [
            'a file that is not one of the app’s',
            '{"hello": true}',
            'This is not a file of saved games, so nothing changed.',
        ],
        [
            'a file from a newer version',
            JSON.stringify({ format: FORMAT, version: FORMAT_VERSION + 1 }),
            'This file was saved by a newer version of the app.',
        ],
    ])('says why it did not read %s, and changes nothing', async (_, text, why) => {
        const { open } = await database(async (store) => {
            await store.saveGame(game('g-1'));
        });
        render(<Backup open={open} kept={() => Promise.resolve(true)} />);
        await screen.findByRole('button', { name: 'Restore from a file' });
        pick(text);
        await waitFor(() => {
            expect(said()).toHaveTextContent(why);
        });
        const store = await open();
        expect((await store.games()).map(({ id }) => id)).toEqual(['g-1']);
        store.close();
    });

    it('says a backup will not hold a record the app cannot read', async () => {
        const { factory, open } = await database();
        await new Promise<void>((resolve, reject) => {
            const opening = factory.open(DATABASE);
            opening.onsuccess = () => {
                const transaction = opening.result.transaction(GAMES, 'readwrite');
                transaction.objectStore(GAMES).put({ id: 'g-bad', game: 42 });
                transaction.oncomplete = () => {
                    opening.result.close();
                    resolve();
                };
                transaction.onerror = () => {
                    reject(transaction.error ?? new Error('not written'));
                };
            };
        });
        render(<Backup open={open} kept={() => Promise.resolve(true)} />);
        expect(
            await screen.findByText(
                'One saved game or player cannot be read, so a file saved now will leave it out.'
            )
        ).toBeVisible();
    });

    it('says why the games could not be opened, and offers neither', async () => {
        render(
            <Backup
                open={() => Promise.reject(new Error(NEWER_DATABASE))}
                kept={() => Promise.resolve(true)}
            />
        );
        await waitFor(() => {
            expect(said()).toHaveTextContent(NEWER_DATABASE);
        });
        expect(screen.queryByRole('button')).toBeNull();
    });

    it('opens the games afresh for each save, so a database closed under the page still saves', async () => {
        const { open } = await database(async (store) => {
            await store.saveGame(game('g-1'));
        });
        const closed = vi.fn();
        const opening = vi.fn(async () => {
            const store = await open();
            return {
                ...store,
                close: () => {
                    closed();
                    store.close();
                },
            };
        });
        render(<Backup open={opening} kept={() => Promise.resolve(true)} save={vi.fn()} />);
        const save = await screen.findByRole('button', { name: 'Save to a file' });
        // The database is let go once the page has read it, as a newer build's upgrade would.
        expect(closed).toHaveBeenCalledOnce();
        save.click();
        await waitFor(() => {
            expect(said()).toHaveTextContent('1 game is ready in');
        });
        expect(opening).toHaveBeenCalledTimes(2);
        expect(closed).toHaveBeenCalledTimes(2);
    });

    it('keeps both buttons when what is unreadable cannot be counted, since a backup is wanted most then', async () => {
        const { open } = await database();
        render(
            <Backup
                open={async () => ({
                    ...(await open()),
                    damaged: () => Promise.reject(new Error('The disk could not be read.')),
                })}
                kept={() => Promise.reject(new Error('No answer.'))}
            />
        );
        expect(await screen.findByRole('button', { name: 'Save to a file' })).toBeVisible();
        expect(screen.getByText(/does not say whether it will keep/)).toBeVisible();
    });
});
