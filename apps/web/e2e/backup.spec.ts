import { readFile } from 'node:fs/promises';

import { hrefOf } from '../src/routes.js';
import { DATABASE, GAMES } from '../src/store/store.js';
import { audit, buildGame, expect, type Page, seed, test } from './support.js';

/*
 * Saving every game to a file and restoring from one, on the about page: a file saved in one
 * browser is restored in another that has never held the game, by keyboard, as a visitor moving
 * their games to a second phone would.
 */

/** The ids of the games in the page's database. */
const savedIds = (page: Page): Promise<string[]> =>
    page.evaluate(
        ({ name, games }) =>
            new Promise<string[]>((resolve, reject) => {
                const opening = indexedDB.open(name);
                opening.onerror = () => {
                    reject(opening.error ?? new Error('not opened'));
                };
                opening.onsuccess = () => {
                    const request = opening.result
                        .transaction(games)
                        .objectStore(games)
                        .getAllKeys();
                    request.onsuccess = () => {
                        opening.result.close();
                        resolve(request.result.map(String));
                    };
                };
            }),
        { name: DATABASE, games: GAMES }
    );

test('saves every game to a file in one browser and restores it in another, by keyboard', async ({
    page,
    browser,
}) => {
    const game = await buildGame({
        id: 'g-moved',
        game: 'flip-7',
        rules: 1,
        options: {},
        players: ['ann', 'ben'],
    });
    await page.goto('/');
    await seed(page, [game]);
    await page.goto(hrefOf('about'));
    const save = page.getByRole('button', { name: 'Save to a file' });
    await expect(save).toBeVisible();
    await expect(page.getByText(/agreed to keep your games/)).toBeVisible();
    await audit(page);

    await save.focus();
    const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.keyboard.press('Enter'),
    ]);
    expect(download.suggestedFilename()).toMatch(/^game-table-tally-\d{4}-\d{2}-\d{2}\.json$/);
    await expect(page.locator('.gtt-status')).toHaveText(
        `1 game is ready in ${download.suggestedFilename()}. Your browser saves it with your downloads.`
    );
    const path = await download.path();
    expect(JSON.parse(await readFile(path, 'utf8'))).toMatchObject({
        format: 'gametabletally',
        games: [{ id: 'g-moved' }],
    });

    const other = await browser.newContext();
    try {
        const second = await other.newPage();
        await second.goto(hrefOf('about'));
        const restore = second.getByRole('button', { name: 'Restore from a file' });
        await restore.focus();
        const [chooser] = await Promise.all([
            second.waitForEvent('filechooser'),
            second.keyboard.press('Enter'),
        ]);
        await chooser.setFiles(path);
        await expect(second.locator('.gtt-status')).toHaveText('Restored 1 game from the file.');
        expect(await savedIds(second)).toEqual(['g-moved']);
    } finally {
        await other.close();
    }
});

test('says why a file that is not one of the app’s was not read, and changes nothing', async ({
    page,
}) => {
    await page.goto(hrefOf('about'));
    const [chooser] = await Promise.all([
        page.waitForEvent('filechooser'),
        page.getByRole('button', { name: 'Restore from a file' }).click(),
    ]);
    await chooser.setFiles({
        name: 'notes.json',
        mimeType: 'application/json',
        buffer: Buffer.from('{"shopping": ["milk"]}'),
    });
    await expect(page.locator('.gtt-status')).toHaveText(
        'This is not a file of saved games, so nothing changed. Choose a file this app saved.'
    );
    expect(await savedIds(page)).toEqual([]);
});
