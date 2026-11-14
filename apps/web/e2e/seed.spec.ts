import { hrefOf } from '../src/routes.js';
import { DATABASE, GAMES } from '../src/store/store.js';
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
