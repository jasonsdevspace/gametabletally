import { IDBFactory } from 'fake-indexeddb';

import { hrefOf } from '../src/routes.js';
import { DATABASE, GAMES, openStore } from '../src/store/store.js';
import { buildGame, expect, seed, test } from './support.js';

const hand = (numbers: readonly number[]) => ({ numbers, modifiers: [], bust: false });

test("seeds the browser's database with a game the app's model built, which the page can read", async ({
    page,
}) => {
    const game = await buildGame(
        { id: 'g-seeded', game: 'flip-7', rules: 1, options: {}, players: ['ann', 'ben', 'cat'] },
        async (model) => {
            for (const entry of [hand([5]), hand([6]), hand([7])])
                await model.enter('g-seeded', entry);
            await model.saveRound('g-seeded');
        }
    );
    expect(game.started).toBe('2026-11-14T10:00:01.000Z');
    expect(game.rounds).toHaveLength(1);

    await page.goto('/');
    await seed(page, [game]);
    await page.goto(hrefOf('game', game.id));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Game in play');
    const read = await page.evaluate(
        ({ name, games, id }) =>
            new Promise((resolve, reject) => {
                const opening = indexedDB.open(name);
                opening.onerror = () => {
                    reject(opening.error ?? new Error('not opened'));
                };
                opening.onsuccess = () => {
                    const request = opening.result.transaction(games).objectStore(games).get(id);
                    request.onsuccess = () => {
                        opening.result.close();
                        resolve(request.result);
                    };
                };
            }),
        { name: DATABASE, games: GAMES, id: game.id }
    );
    expect(read).toEqual(game);
});

/** A database's version and stores, each with its key and indexes, as a page or Node reads them. */
const shapeOf = (database: IDBDatabase) => ({
    version: database.version,
    stores: [...database.objectStoreNames].sort().map((name) => {
        const store = database.transaction(name).objectStore(name);
        return { name, keyPath: store.keyPath, indexes: [...store.indexNames].sort() };
    }),
});

test('seeds a database shaped exactly as the app makes it', async ({ page }) => {
    const factory = new IDBFactory();
    const store = await openStore(factory, DATABASE);
    store.close();
    const made = await new Promise<ReturnType<typeof shapeOf>>((resolve, reject) => {
        const opening = factory.open(DATABASE);
        opening.onerror = () => {
            reject(opening.error ?? new Error('not opened'));
        };
        opening.onsuccess = () => {
            resolve(shapeOf(opening.result));
            opening.result.close();
        };
    });
    await page.goto('/');
    await seed(page, []);
    const seeded = await page.evaluate(
        (name) =>
            new Promise((resolve, reject) => {
                const opening = indexedDB.open(name);
                opening.onerror = () => {
                    reject(opening.error ?? new Error('not opened'));
                };
                opening.onsuccess = () => {
                    const database = opening.result;
                    resolve({
                        version: database.version,
                        stores: [...database.objectStoreNames].sort().map((store) => {
                            const read = database.transaction(store).objectStore(store);
                            return {
                                name: store,
                                keyPath: read.keyPath,
                                indexes: [...read.indexNames].sort(),
                            };
                        }),
                    });
                    database.close();
                };
            }),
        DATABASE
    );
    expect(seeded).toEqual(made);
});
