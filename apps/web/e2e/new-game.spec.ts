import { GAMES } from '@gametabletally/scoring';
import { THEME_KEY } from '@jasonsdevspace/design-kit/theme';

import { newGameOf } from '../src/app/PlayStart.js';
import { hrefOf } from '../src/routes.js';
import type { SavedPlayer } from '../src/store/format.js';
import {
    appLine,
    audit,
    doubleTheText,
    expect,
    type Page,
    seed,
    smallTargets,
    test,
} from './support.js';

/*
 * The new game screen, as deployed: a game of each kind started from the start screen's link, the
 * seats reordered by keyboard and by touch, a seat's name on one line with its buttons beside it,
 * or under it at twice the text size on a phone, a refused name taking focus to its field, a
 * removed seat put back from the toast, the start button off until the game takes the players
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
        // The start screen now offers the new game to continue, at the first seat's turn, or at
        // the bids of a game whose round takes every player's bid on one screen.
        await page.goto(hrefOf('play'));
        await expect(page.getByRole('heading', { name: 'Game in play' })).toBeVisible();
        await expect(page.getByText(game.name, { exact: true }).first()).toBeVisible();
        await expect(page.getByText(/^(Ann's score|The bids) (is|are) next\.$/)).toBeVisible();
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
    // Ann is last, so Move Ann down is off, and focus goes to the way back up rather than leave
    // the seat.
    await expect(down).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByRole('button', { name: 'Move Ann up' })).toBeFocused();
    await expect(appLine(page)).toHaveText('Ann moves to seat 3.');
});

test("draws a seat button's icon at the kit's icon-only size, growing with the text", async ({
    page,
}) => {
    await fromTheLink(page, 'skyjo');
    await page.getByRole('button', { name: 'Add Ann' }).click();
    const icon = page.getByRole('button', { name: 'Remove Ann' }).locator('svg');
    const before = (await icon.boundingBox())?.width ?? 0;
    // An icon-only button draws its icon at 1.25rem, 20px at the default text size.
    expect(before).toBeCloseTo(20, 0);
    await doubleTheText(page, icon, 'width');
    expect(((await icon.boundingBox())?.width ?? 0) / before).toBeLessThan(2.1);
});

/** Where a seat's name, its place and its first button are drawn, by the lines the text takes. */
const seatDrawn = (page: Page) =>
    page
        .getByRole('list', { name: 'Players, in seat order' })
        .locator('.dk-row')
        .first()
        .evaluate((row) => {
            const lines = (selector: string) => {
                const part = row.querySelector(selector);
                if (part === null) throw new Error(`The seat has no ${selector}.`);
                const range = document.createRange();
                range.selectNodeContents(part);
                const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
                if (rects.length === 0) throw new Error(`The seat's ${selector} draws no text.`);
                return {
                    lines: new Set(rects.map((rect) => Math.round(rect.top))).size,
                    bottom: Math.max(...rects.map((rect) => rect.bottom)),
                };
            };
            const button = row.querySelector('button');
            if (button === null) throw new Error('The seat has no buttons.');
            return {
                name: lines('.dk-row-title'),
                seat: lines('.dk-row-detail'),
                firstButton: button.getBoundingClientRect().top,
            };
        });

test("keeps a seat's name on one line on a phone, its buttons beside it and under it at twice the text size", async ({
    page,
}) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await fromTheLink(page, 'skyjo');
    await page.getByRole('button', { name: 'Add Ann' }).click();
    // At the default size the buttons sit beside the name, so a seat takes one row's height.
    const usual = await seatDrawn(page);
    expect(usual.name.lines).toBe(1);
    expect(usual.firstButton).toBeLessThan(usual.name.bottom);
    await doubleTheText(page, seated(page).first(), 'height');
    // The name and its seat each read across on one line, rather than down the screen a letter at
    // a time, and the seat's buttons start below them both.
    const doubled = await seatDrawn(page);
    expect(doubled.name.lines).toBe(1);
    expect(doubled.seat.lines).toBe(1);
    expect(doubled.firstButton).toBeGreaterThanOrEqual(doubled.seat.bottom - 1);
    // At twice the text size the seats sit below the fold, so the check scrolls down to them.
    const remove = page.getByRole('button', { name: 'Remove Ann' });
    await remove.scrollIntoViewIfNeeded();
    await expect(remove).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        390
    );
});

test('moves focus to the name field when the Add button is refused, the field described by why', async ({
    page,
}) => {
    await fromTheLink(page, 'skyjo');
    await page.getByRole('button', { name: 'Add Ann' }).click();
    await nameField(page).fill('ann');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(nameField(page)).toBeFocused();
    await expect(nameField(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(nameField(page)).toHaveAccessibleDescription(/Ann has a seat already\./);
    // The kit says the field's name and its error, since a screen reader may read the error late.
    await expect(appLine(page)).toHaveText("A new player's name: Error: Ann has a seat already.");
    await audit(page);
});

test('puts a removed seat back in the seat it left, from the toast', async ({ page }) => {
    await fromTheLink(page, 'skyjo');
    for (const name of ['Ann', 'Ben', 'Cat'])
        await page.getByRole('button', { name: `Add ${name}` }).click();
    await page.getByRole('button', { name: 'Remove Ben' }).click();
    await expect(seated(page)).toHaveText(['Ann', 'Cat']);
    await expect(page.locator('.dk-app-toast').getByRole('status')).toContainText(
        'Ben is off the seats.'
    );
    await audit(page);
    await page.locator('.dk-app-toast').getByRole('button', { name: 'Undo' }).click();
    await expect(seated(page)).toHaveText(['Ann', 'Ben', 'Cat']);
    await expect(appLine(page)).toHaveText('Ben takes seat 2 again.');
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
