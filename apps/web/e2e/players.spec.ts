import { THEME_KEY } from '@jasonsdevspace/design-kit/theme';

import { hrefOf } from '../src/routes.js';
import type { SavedPlayer } from '../src/store/format.js';
import { audit, expect, type Page, seed, smallTargets, test } from './support.js';

/*
 * The players screen and a player's own page, as deployed: a player added, renamed and removed
 * with Undo, the empty list, and both screens audited on a desktop and a phone profile in each
 * theme.
 */

const player = (id: string, name: string, added: string): SavedPlayer => ({
    id,
    name,
    added,
    removed: false,
});

const withPlayers = async (page: Page) => {
    await page.goto('/');
    await seed(
        page,
        [],
        [player('ann', 'Ann', '2026-11-01T10:00:00Z'), player('ben', 'Ben', '2026-11-01T10:01:00Z')]
    );
    await page.goto(hrefOf('players'));
    await expect(page.getByRole('list', { name: 'Players' })).toBeVisible();
};

const listed = (page: Page) => page.getByRole('list', { name: 'Players' }).locator('.dk-row-title');

test('adds a player, renames them on their page and removes them, with Undo', async ({ page }) => {
    await withPlayers(page);
    await expect(listed(page)).toHaveText(['Ann', 'Ben']);

    const field = page.getByRole('textbox', { name: "A new player's name" });
    await field.fill('Cat');
    await field.press('Enter');
    await expect(listed(page)).toHaveText(['Ann', 'Ben', 'Cat']);

    await page.getByRole('link', { name: /^Cat/ }).click();
    await expect(page).toHaveURL(/\/player\/\?id=/);
    await expect(page.getByRole('heading', { name: 'Cat' })).toBeVisible();
    await audit(page);
    const name = page.getByRole('textbox', { name: 'Name' });
    await name.fill('Ann');
    await name.press('Tab');
    await expect(page.getByText('A player is already named Ann.')).toBeVisible();
    await name.fill('Catherine');
    await name.press('Tab');
    await expect(page.getByRole('heading', { name: 'Catherine' })).toBeVisible();

    await page.getByRole('button', { name: 'Remove Catherine' }).click();
    await expect(page).toHaveURL(hrefOf('players'));
    await expect(listed(page)).toHaveText(['Ann', 'Ben']);
    await expect(page.locator('.dk-app-toast').getByRole('status')).toContainText(
        'Catherine removed.'
    );
    // The toast closes by a button named Close, as the kit's toast has said since 0.8.0.
    await expect(
        page.locator('.dk-app-toast').getByRole('button', { name: 'Close', exact: true })
    ).toBeVisible();
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(listed(page)).toHaveText(['Ann', 'Ben', 'Catherine']);

    // The name was saved on the phone, so it holds after a reload.
    await page.reload();
    await expect(listed(page)).toHaveText(['Ann', 'Ben', 'Catherine']);
});

test('says what will appear and how to add a player when there is none', async ({ page }) => {
    await page.goto(hrefOf('players'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(page.getByText(/^No players yet\./)).toBeVisible();
    await expect(page.getByRole('textbox', { name: "A new player's name" })).toBeVisible();
});

for (const theme of ['light', 'dark'] as const)
    test(`passes the axe audit and the target size check on both screens, in the ${theme} theme`, async ({
        page,
    }) => {
        await page.addInitScript(
            ([key, value]) => {
                localStorage.setItem(key, value);
            },
            [THEME_KEY, theme] as const
        );
        await withPlayers(page);
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await audit(page);
        expect(await smallTargets(page)).toEqual([]);
        await page.getByRole('link', { name: /^Ann/ }).click();
        await expect(page.getByRole('heading', { name: 'Ann' })).toBeVisible();
        await audit(page);
        expect(await smallTargets(page)).toEqual([]);
    });
