import { score } from '@gametabletally/scoring';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';

import {
    FORMAT,
    FORMAT_VERSION,
    readFile,
    type SavedFile,
    type SavedGame,
    type SavedPlayer,
    toScoreInput,
} from './format.js';
import { BLOCKED_DATABASE, keepStorage, NEWER_DATABASE, openStore, storageKept } from './store.js';

/*
 * The store runs here against an IndexedDB that lives in memory, with the real one's
 * transactions and versions, and a database of its own for each test. What only a browser has,
 * such as data that outlives a closed tab on a real disk, is the browser tests' to prove.
 */

const player = (id: string, name: string, added: string): SavedPlayer => ({
    id,
    name,
    added,
    removed: false,
});

const ANN = player('p-ann', 'Ann', '2026-11-01T10:00:00Z');
const BEN = player('p-ben', 'Ben', '2026-11-01T10:01:00Z');
const CAT = player('p-cat', 'Cat', '2026-11-01T10:02:00Z');

const hand = (numbers: readonly number[], modifiers: readonly string[] = []) => ({
    numbers,
    modifiers,
    bust: false,
});

const FIRST = { entries: { 'p-ann': hand([10]), 'p-ben': hand([9]), 'p-cat': hand([8]) } };
const SECOND = {
    entries: { 'p-ann': hand([1]), 'p-ben': hand([2, 3], ['x2']), 'p-cat': hand([4]) },
};

const game = (id: string, rounds: readonly unknown[], changed: string): SavedGame => ({
    id,
    game: 'flip-7',
    rules: 1,
    options: {},
    players: ['p-ann', 'p-ben', 'p-cat'],
    rounds,
    draft: null,
    started: '2026-11-01T10:05:00Z',
    changed,
});

describe('players', () => {
    it('adds players and lists them in the order they were added', async () => {
        const store = await openStore(new IDBFactory());
        await store.savePlayer(BEN);
        await store.savePlayer(ANN);
        expect(await store.players()).toEqual([ANN, BEN]);
    });

    it('renames a player by saving them again, and keeps their id', async () => {
        const store = await openStore(new IDBFactory());
        await store.savePlayer(ANN);
        await store.savePlayer({ ...ANN, name: 'Annie' });
        expect(await store.players()).toEqual([{ ...ANN, name: 'Annie' }]);
    });

    it('deletes a removed player who never played', async () => {
        const store = await openStore(new IDBFactory());
        await store.savePlayer(ANN);
        await store.removePlayer('p-ann');
        expect(await store.players()).toEqual([]);
    });

    it('keeps a removed player who has played, marked as removed, so their games say who played', async () => {
        const store = await openStore(new IDBFactory());
        for (const each of [ANN, BEN, CAT]) await store.savePlayer(each);
        await store.saveGame(game('g-1', [FIRST], '2026-11-01T10:20:00Z'));
        await store.removePlayer('p-ann');
        expect(await store.players()).toEqual([{ ...ANN, removed: true }, BEN, CAT]);
        expect((await store.game('g-1'))?.players).toContain('p-ann');
    });

    it('does nothing when asked to remove a player it does not hold', async () => {
        const store = await openStore(new IDBFactory());
        await store.savePlayer(ANN);
        await store.removePlayer('p-nobody');
        expect(await store.players()).toEqual([ANN]);
    });
});

describe('games', () => {
    it('keeps a game after each entry, and has it when the database is opened again', async () => {
        const factory = new IDBFactory();
        const first = await openStore(factory);
        await first.saveGame(game('g-1', [FIRST], '2026-11-01T10:20:00Z'));
        await first.saveGame(game('g-1', [FIRST, SECOND], '2026-11-01T10:30:00Z'));
        first.close();

        const second = await openStore(factory);
        expect(await second.games()).toEqual([
            game('g-1', [FIRST, SECOND], '2026-11-01T10:30:00Z'),
        ]);
    });

    it('keeps a round still being played as it was after its last entry', async () => {
        const factory = new IDBFactory();
        const open = { entries: { 'p-ann': hand([12]) } };
        const first = await openStore(factory);
        await first.saveGame(game('g-1', [FIRST, open], '2026-11-01T10:25:00Z'));
        first.close();

        const saved = await (await openStore(factory)).game('g-1');
        expect(saved?.rounds).toEqual([FIRST, open]);
        expect(saved ? score(toScoreInput(saved)).rounds.map(({ state }) => state) : []).toEqual([
            'scored',
            'open',
        ]);
    });

    it('scores a game opened again as it scored when it was saved, under the rule set it names', async () => {
        const factory = new IDBFactory();
        const played = game('g-1', [FIRST, SECOND], '2026-11-01T10:30:00Z');
        const before = score(toScoreInput(played));
        const first = await openStore(factory);
        await first.saveGame(played);
        first.close();

        const saved = await (await openStore(factory)).game('g-1');
        expect(saved?.rules).toBe(1);
        expect(saved ? score(toScoreInput(saved)) : null).toEqual(before);
        expect(before.totals).toEqual({ 'p-ann': 11, 'p-ben': 19, 'p-cat': 12 });
    });

    it('lists games with the last changed first', async () => {
        const store = await openStore(new IDBFactory());
        await store.saveGame(game('g-old', [FIRST], '2026-11-01T10:20:00Z'));
        await store.saveGame(game('g-new', [FIRST], '2026-11-03T10:20:00Z'));
        expect((await store.games()).map(({ id }) => id)).toEqual(['g-new', 'g-old']);
    });

    it('removes a game, and says there is none when asked for it', async () => {
        const store = await openStore(new IDBFactory());
        await store.saveGame(game('g-1', [FIRST], '2026-11-01T10:20:00Z'));
        await store.removeGame('g-1');
        expect(await store.game('g-1')).toBeNull();
        expect(await store.games()).toEqual([]);
    });
});

/**
 * An id the database cannot use as a key, which fails the change it is part of. Nothing the app
 * reads ever holds one, so it takes a cast to make.
 */
// eslint-disable-next-line @typescript-eslint/consistent-type-assertions -- an id no reader lets through, to fail a change on purpose
const UNKEYABLE = {} as unknown as string;

describe('export and import', () => {
    const filled = async () => {
        const store = await openStore(new IDBFactory());
        for (const each of [ANN, BEN, CAT]) await store.savePlayer(each);
        await store.saveGame(game('g-1', [FIRST, SECOND], '2026-11-01T10:30:00Z'));
        await store.saveGame(game('g-2', [FIRST], '2026-11-02T10:30:00Z'));
        return store;
    };

    it('writes one file holding every player and every game, in the shape it reads', async () => {
        const file = await (await filled()).exportFile('2026-11-04T09:00:00Z');
        expect(file).toMatchObject({
            format: FORMAT,
            version: FORMAT_VERSION,
            exported: '2026-11-04T09:00:00Z',
        });
        expect(file.players.map(({ id }) => id)).toEqual(['p-ann', 'p-ben', 'p-cat']);
        expect(file.games.map(({ id }) => id)).toEqual(['g-2', 'g-1']);
        expect(readFile(JSON.stringify(file))).toEqual(file);
    });

    it('reads a file into an empty browser', async () => {
        const file = await (await filled()).exportFile('2026-11-04T09:00:00Z');
        const empty = await openStore(new IDBFactory());
        expect(await empty.importFile(file)).toEqual({ players: 3, games: 2 });
        expect(await empty.exportFile('2026-11-04T09:00:00Z')).toEqual(file);
    });

    it('merges a file into a browser that holds games, with no game twice', async () => {
        const file = await (await filled()).exportFile('2026-11-04T09:00:00Z');
        const here = await openStore(new IDBFactory());
        await here.savePlayer({ ...ANN, name: 'Annie' });
        await here.saveGame(game('g-1', [FIRST], '2026-11-01T10:20:00Z'));
        await here.saveGame(game('g-2', [FIRST, SECOND], '2026-11-03T08:00:00Z'));
        await here.saveGame(game('g-3', [FIRST], '2026-11-03T09:00:00Z'));

        expect(await here.importFile(file)).toEqual({ players: 2, games: 1 });
        const games = await here.games();
        expect(games.map(({ id }) => id).sort()).toEqual(['g-1', 'g-2', 'g-3']);
        // Whichever copy of a game was changed later is the one kept.
        expect(games.find(({ id }) => id === 'g-1')?.rounds).toEqual([FIRST, SECOND]);
        expect(games.find(({ id }) => id === 'g-2')?.rounds).toEqual([FIRST, SECOND]);
        // A player who is here keeps the name they have here.
        expect((await here.players()).map(({ name }) => name)).toEqual(['Annie', 'Ben', 'Cat']);
    });

    it('adds nothing when the same file is read twice', async () => {
        const file = await (await filled()).exportFile('2026-11-04T09:00:00Z');
        const here = await openStore(new IDBFactory());
        await here.importFile(file);
        expect(await here.importFile(file)).toEqual({ players: 0, games: 0 });
        expect((await here.games()).length).toBe(file.games.length);
    });

    it('changes nothing saved when a file is from a newer version', async () => {
        const here = await filled();
        const before = await here.exportFile('2026-11-04T09:00:00Z');
        const newer = JSON.stringify({ ...before, version: FORMAT_VERSION + 1, games: [] });
        // The file is refused as it is read, so there is nothing to hand to the store.
        expect(readFile(newer)).toMatchObject({ code: 'newer-format' });
        expect(await here.exportFile('2026-11-04T09:00:00Z')).toEqual(before);
    });

    it('saves a merge whole or not at all', async () => {
        const here = await filled();
        const before = await here.exportFile('2026-11-04T09:00:00Z');
        const file = {
            ...before,
            players: [player('p-dan', 'Dan', '2026-11-05T10:00:00Z')],
            games: [{ ...game('g-9', [FIRST], '2026-11-05T10:00:00Z'), id: UNKEYABLE }],
        };
        await expect(here.importFile(file)).rejects.toThrow();
        expect(await here.exportFile('2026-11-04T09:00:00Z')).toEqual(before);
    });
});

/** Puts a record straight into a database, past the store, as a damaged or foreign one would sit. */
const plant = (factory: IDBFactory, kind: string, record: unknown): Promise<void> =>
    new Promise((resolve, reject) => {
        const opening = factory.open('gametabletally');
        opening.onerror = () => {
            reject(opening.error ?? new Error('not opened'));
        };
        opening.onsuccess = () => {
            const database = opening.result;
            const transaction = database.transaction(kind, 'readwrite');
            transaction.objectStore(kind).put(record);
            transaction.oncomplete = () => {
                database.close();
                resolve();
            };
        };
    });

describe('what the store refuses to save', () => {
    it('refuses a player the reader would not read, and saves nothing', async () => {
        const store = await openStore(new IDBFactory());
        await expect(store.savePlayer({ ...ANN, name: '' })).rejects.toThrow(/not a player/);
        await expect(store.savePlayer({ ...ANN, added: 'today' })).rejects.toThrow(/not a player/);
        expect(await store.players()).toEqual([]);
    });

    it('refuses a game the reader would not read, and saves nothing', async () => {
        const store = await openStore(new IDBFactory());
        const played = game('g-1', [FIRST], '2026-11-01T10:20:00Z');
        await expect(store.saveGame({ ...played, rules: 1.5 })).rejects.toThrow(/not a game/);
        await expect(store.saveGame({ ...played, started: '' })).rejects.toThrow(/not a game/);
        expect(await store.games()).toEqual([]);
        expect(await store.damaged()).toBe(0);
    });
});

describe('a record in the database that is not a player or a game', () => {
    const withDamage = async () => {
        const factory = new IDBFactory();
        const store = await openStore(factory);
        for (const each of [ANN, BEN, CAT]) await store.savePlayer(each);
        await store.saveGame(game('g-1', [FIRST], '2026-11-01T10:20:00Z'));
        store.close();
        await plant(factory, 'players', { id: 'p-odd', name: 7 });
        await plant(factory, 'games', { id: 'g-odd', players: ['p-ben'], rounds: 'lost' });
        return openStore(factory);
    };

    it('is passed over when the players and games are read', async () => {
        const store = await withDamage();
        expect((await store.players()).map(({ id }) => id)).toEqual(['p-ann', 'p-ben', 'p-cat']);
        expect((await store.games()).map(({ id }) => id)).toEqual(['g-1']);
        expect(await store.game('g-odd')).toBeNull();
    });

    it('is counted, and left out of an exported file', async () => {
        const store = await withDamage();
        expect(await store.damaged()).toBe(2);
        const file = await store.exportFile('2026-11-04T09:00:00Z');
        expect(file.games.map(({ id }) => id)).toEqual(['g-1']);
        expect(readFile(JSON.stringify(file))).toEqual(file);
    });

    it('still keeps a player it names from being deleted', async () => {
        const factory = new IDBFactory();
        const store = await openStore(factory);
        await store.savePlayer(BEN);
        store.close();
        await plant(factory, 'games', { id: 'g-odd', players: ['p-ben'], rounds: 'lost' });
        const again = await openStore(factory);
        await again.removePlayer('p-ben');
        expect(await again.players()).toEqual([{ ...BEN, removed: true }]);
    });
});

describe('a merge by the time each copy was changed', () => {
    it('keeps the later moment, however finely each copy wrote its time', async () => {
        const here = await openStore(new IDBFactory());
        await here.saveGame(game('g-1', [FIRST], '2026-11-01T10:20:00Z'));
        const file: SavedFile = {
            format: FORMAT,
            version: FORMAT_VERSION,
            exported: '2026-11-04T09:00:00Z',
            players: [],
            // Half a second later, and before the saved copy when the two are read as text.
            games: [game('g-1', [FIRST, SECOND], '2026-11-01T10:20:00.500Z')],
        };
        expect(await here.importFile(file)).toEqual({ players: 0, games: 1 });
        expect((await here.game('g-1'))?.rounds).toEqual([FIRST, SECOND]);
    });

    it('keeps the copy on the phone when the two were changed at the same moment', async () => {
        const here = await openStore(new IDBFactory());
        await here.saveGame(game('g-1', [FIRST], '2026-11-01T10:20:00Z'));
        const file: SavedFile = {
            format: FORMAT,
            version: FORMAT_VERSION,
            exported: '2026-11-04T09:00:00Z',
            players: [],
            games: [game('g-1', [FIRST, SECOND], '2026-11-01T10:20:00.000Z')],
        };
        expect(await here.importFile(file)).toEqual({ players: 0, games: 0 });
        expect((await here.game('g-1'))?.rounds).toEqual([FIRST]);
    });
});

/** Opens a database at a version, as a build with a later saved shape would. */
const openAt = (factory: IDBFactory, version: number): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const opening = factory.open('gametabletally', version);
        opening.onsuccess = () => {
            resolve(opening.result);
        };
        opening.onerror = () => {
            reject(opening.error ?? new Error('not opened'));
        };
        opening.onblocked = () => {
            reject(new Error('blocked'));
        };
    });

describe('a database and a build of different versions', () => {
    it('says to update the app when a newer build has already upgraded the database', async () => {
        const factory = new IDBFactory();
        (await openAt(factory, FORMAT_VERSION + 1)).close();
        await expect(openStore(factory)).rejects.toThrow(NEWER_DATABASE);
    });

    it('lets go of the database when a newer build asks to upgrade it', async () => {
        const factory = new IDBFactory();
        await openStore(factory);
        // The store above is still open. A newer build opens at the next version and is not
        // kept waiting, since the open store closes when it is asked to.
        const upgraded = await openAt(factory, FORMAT_VERSION + 1);
        expect(upgraded.version).toBe(FORMAT_VERSION + 1);
        upgraded.close();
    });

    it('says to close the other tab when one keeps the database open', async () => {
        const factory = new IDBFactory();
        // A connection that never lets go, as a tab of a build before this change would be.
        const held = await openAt(factory, FORMAT_VERSION);
        await expect(openStore(factory, 'gametabletally', FORMAT_VERSION + 1)).rejects.toThrow(
            BLOCKED_DATABASE
        );
        held.close();
    });
});

describe('asking the browser to keep what is saved', () => {
    /** A browser's storage manager that has agreed or not, and counts how often it is asked. */
    const manager = (kept: boolean, answer: () => Promise<boolean>) => {
        const persist = vi.fn(answer);
        return { persist, persisted: () => Promise.resolve(kept) };
    };

    it('says whether the browser agreed', async () => {
        expect(await keepStorage(manager(false, () => Promise.resolve(true)))).toBe(true);
        expect(await keepStorage(manager(false, () => Promise.resolve(false)))).toBe(false);
    });

    it('does not ask a browser that has agreed already, since one may ask the visitor each time', async () => {
        const storage = manager(true, () => Promise.resolve(true));
        expect(await keepStorage(storage)).toBe(true);
        expect(storage.persist).not.toHaveBeenCalled();
    });

    it('says no where the browser cannot be asked, or refuses to answer', async () => {
        expect(await keepStorage(null)).toBe(false);
        expect(await keepStorage(manager(false, () => Promise.reject(new Error('blocked'))))).toBe(
            false
        );
    });

    it('says whether the browser has agreed without asking, and nothing where it does not say', async () => {
        const storage = manager(true, () => Promise.resolve(true));
        expect(await storageKept(storage)).toBe(true);
        expect(await storageKept(manager(false, () => Promise.resolve(true)))).toBe(false);
        expect(storage.persist).not.toHaveBeenCalled();
        expect(await storageKept(null)).toBeNull();
        expect(
            await storageKept({ persisted: () => Promise.reject(new Error('blocked')) })
        ).toBeNull();
    });
});
