import { score } from '@gametabletally/scoring';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import {
    FORMAT,
    FORMAT_VERSION,
    readFile,
    type SavedGame,
    type SavedPlayer,
    toScoreInput,
} from './format.js';
import { keepStorage, openStore } from './store.js';

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

describe('asking the browser to keep what is saved', () => {
    it('says whether the browser agreed', async () => {
        expect(await keepStorage({ persist: () => Promise.resolve(true) })).toBe(true);
        expect(await keepStorage({ persist: () => Promise.resolve(false) })).toBe(false);
    });

    it('says no where the browser cannot be asked, or refuses to answer', async () => {
        expect(await keepStorage(null)).toBe(false);
        expect(await keepStorage({ persist: () => Promise.reject(new Error('blocked')) })).toBe(
            false
        );
    });
});
