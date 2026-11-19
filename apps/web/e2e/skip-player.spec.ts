import { hrefOf } from '../src/routes.js';
import type { SavedPlayer } from '../src/store/format.js';
import { audit, buildGame, expect, type Page, seed, test } from './support.js';

/*
 * Skipping a player for a round, as deployed: a player skipped by keyboard is passed over, the round
 * saves with the others, the scores page says they missed a round, and the next round asks for them
 * again. A skip that would leave one player is not offered, and the screen says why.
 */

const NAMES = ['Ann', 'Ben', 'Cat'];

const player = (name: string): SavedPlayer => ({
    id: name.toLowerCase(),
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const key = (page: Page, name: string) => page.getByRole('button', { name, exact: true });
const dock = (page: Page) => page.getByRole('region', { name: 'Actions' });

const openGame = async (page: Page) => {
    await page.goto('/');
    const game = await buildGame({
        id: 'g-1',
        game: 'flip-7',
        rules: 1,
        options: {},
        players: ['ann', 'ben', 'cat'],
    });
    await seed(page, [game], NAMES.map(player));
    await page.goto(hrefOf('game', 'g-1'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('.gtt-score-name')).toHaveText('Ann');
};

test('skips a player for one round by keyboard, and asks for them in the next', async ({
    page,
}) => {
    await openGame(page);
    await audit(page);
    await page.getByRole('button', { name: 'Skip Ann this round' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.gtt-score-name')).toHaveText('Ben');
    await expect(page.getByText('Ann is out of this round.')).toBeVisible();
    await expect(
        page.getByText('A round needs two players, so no one else can sit this one out.')
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Put Ann back' })).toBeFocused();
    await audit(page);

    // Ben and Cat enter, and the round saves with Ann out of it.
    await key(page, '4').click();
    await dock(page).getByRole('button', { name: 'Next: Cat' }).click();
    await key(page, '5').click();
    await dock(page).getByRole('button', { name: 'Save the round' }).click();
    await expect(page.locator('.dk-app-toast').getByRole('status')).toContainText(
        'Ann out of the round'
    );

    // The next round asks for Ann again.
    await expect(page.locator('.gtt-score-name')).toHaveText('Ann');
    await expect(page.getByRole('button', { name: 'Skip Ann this round' })).toBeVisible();
    await expect(page.getByText('Ann is out of this round.')).toHaveCount(0);

    // The scores page says Ann missed a round.
    await dock(page).getByRole('link', { name: 'Scores' }).click();
    await expect(page.getByRole('list', { name: 'Standings' })).toContainText(
        'Ann, 3rd place, missed a round, 0 points'
    );
    await audit(page);
});
