import { GAMES } from '@gametabletally/scoring';
import { THEME_KEY } from '@jasonsdevspace/design-kit/theme';

import { newGameOf } from '../src/app/PlayStart.js';
import { hrefOf } from '../src/routes.js';
import type { SavedPlayer } from '../src/store/format.js';
import { audit, expect, type Page, seed, smallTargets, test } from './support.js';

/*
 * The new game screen, as deployed: a game of each kind started from the start screen's link, the
 * seats reordered by keyboard and by touch, the start button off until the game takes the players
 * seated, and the screen audited on a desktop and a phone profile in each theme.
 */

const NAMES = ['Ann', 'Ben', 'Cat', 'Dan'];

const player = (id: string, name: string): SavedPlayer => ({
    id,
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const nameField = (page: Page) => page.getByRole('textbox', { name: "A new player's name" });

/** Types a name and adds it, by the keyboard's Enter, as a phone's Done key does. */
const addByName = async (page: Page, name: string) => {
    await nameField(page).fill(name);
    await nameField(page).press('Enter');
    await expect(nameField(page)).toHaveValue('');
};

const seated = (page: Page) =>
    page.getByRole('list', { name: 'Players, in seat order' }).locator('.dk-row-title');

/** The new game screen with saved players, from the start screen's link for a game. */
const fromTheLink = async (page: Page, game: string) => {
    await page.goto('/');
    await seed(
        page,
        [],
        NAMES.map((name) => player(name.toLowerCase(), name))
    );
    await page.goto(hrefOf('play'));
    await page.locator(`a[data-game="${game}"]`).click();
    await expect(page).toHaveURL(newGameOf(game));
    await expect(page.getByRole('group', { name: 'Saved players' })).toBeVisible();
};

for (const game of GAMES)
    test(`starts a game of ${game.name} from the start screen, with the players typed`, async ({
        page,
    }) => {
        await page.goto(newGameOf(game.id));
        await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
        await expect(page.getByRole('radio', { name: new RegExp(`^${game.name}`) })).toBeChecked();
        const start = page.getByRole('region', { name: 'Actions' }).getByRole('button', {
            name: 'Start the game',
        });
        for (const name of NAMES.slice(0, game.minPlayers)) {
            await expect(start).toHaveAttribute('aria-disabled', 'true');
            await addByName(page, name);
        }
        await expect(seated(page)).toHaveText(NAMES.slice(0, game.minPlayers));
        await expect(start).not.toHaveAttribute('aria-disabled');
        await audit(page);
        await start.click();
        await expect(page).toHaveURL(/\/game\/\?id=[\w-]+$/);
        // The start screen now offers the new game to continue, at the first seat's turn.
        await page.goto(hrefOf('play'));
        await expect(page.getByRole('heading', { name: 'Game in play' })).toBeVisible();
        await expect(page.getByText(game.name, { exact: true }).first()).toBeVisible();
        await expect(page.getByText(/^Ann's (score|bid) is next\.$/)).toBeVisible();
    });

test('says how many the game takes beside the start button, tied to it', async ({ page }) => {
    await fromTheLink(page, 'wizard');
    const start = page.getByRole('button', { name: 'Start the game' });
    await expect(start).toHaveAccessibleDescription('Wizard takes 3 players or more. Add 3 more.');
    await page.getByRole('button', { name: 'Add Ann' }).click();
    await expect(start).toHaveAccessibleDescription('Wizard takes 3 players or more. Add 2 more.');
    // Forced, since Playwright waits for an off button to come on, and a press must do nothing.
    await start.click({ force: true });
    await expect(page).toHaveURL(newGameOf('wizard'));
});

test('reorders the seats by keyboard, keeping focus on the button and saying each new place', async ({
    page,
}) => {
    await fromTheLink(page, 'skyjo');
    for (const name of ['Ann', 'Ben', 'Cat'])
        await page.getByRole('button', { name: `Add ${name}` }).click();
    const down = page.getByRole('button', { name: 'Move Ann down' });
    await down.focus();
    await page.keyboard.press('Enter');
    await expect(seated(page)).toHaveText(['Ben', 'Ann', 'Cat']);
    await expect(down).toBeFocused();
    await page.keyboard.press('Space');
    await expect(seated(page)).toHaveText(['Ben', 'Cat', 'Ann']);
    await expect(down).toBeFocused();
    await expect(down).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('main').getByRole('status')).toHaveText('Ann moves to seat 3.');
});

test("grows a seat button's icon with the text, at twice the text size", async ({ page }) => {
    await fromTheLink(page, 'skyjo');
    await page.getByRole('button', { name: 'Add Ann' }).click();
    const icon = page.getByRole('button', { name: 'Remove Ann' }).locator('svg');
    const before = (await icon.boundingBox())?.width ?? 0;
    expect(before).toBeGreaterThan(0);
    // A reader who raises only the text size raises the root's size, as a browser's setting does.
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expect
        .poll(async () => (await icon.boundingBox())?.width ?? 0)
        .toBeCloseTo(before * 2, 0);
});

test('reorders the seats by touch', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone', 'A tap needs a touch screen.');
    await fromTheLink(page, 'skyjo');
    for (const name of ['Ann', 'Ben'])
        await page.getByRole('button', { name: `Add ${name}` }).tap();
    await page.getByRole('button', { name: 'Move Ben up' }).tap();
    await expect(seated(page)).toHaveText(['Ben', 'Ann']);
    await page.getByRole('button', { name: 'Remove Ben' }).tap();
    await expect(seated(page)).toHaveText(['Ann']);
});

for (const theme of ['light', 'dark'] as const)
    test(`passes the axe audit and the target size check with seats, in the ${theme} theme`, async ({
        page,
    }) => {
        await page.addInitScript(
            ([key, value]) => {
                localStorage.setItem(key, value);
            },
            [THEME_KEY, theme] as const
        );
        await fromTheLink(page, 'flip-7');
        await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
        await page.getByRole('button', { name: 'Add Ann' }).click();
        await page.getByRole('button', { name: 'Add Ben' }).click();
        await addByName(page, '');
        await expect(page.getByText("Enter the player's name.")).toBeVisible();
        await audit(page);
        expect(await smallTargets(page)).toEqual([]);
        // Move and remove are at least the kit's target, 2.75rem, in the frame.
        for (const name of ['Move Ann down', 'Remove Ann']) {
            const box = await page.getByRole('button', { name }).boundingBox();
            expect(Math.min(box?.width ?? 0, box?.height ?? 0), name).toBeGreaterThanOrEqual(44);
        }
    });
