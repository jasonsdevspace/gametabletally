import { hrefOf } from '../src/routes.js';
import { expect, test } from './support.js';

/*
 * The count of page views, as built: a build opened anywhere but the live address, as every test
 * and audit opens it, never loads the tracker and never sends Plausible a thing.
 */

test('sends nothing to Plausible from a build that is not on the live address', async ({
    page,
}) => {
    const sent: string[] = [];
    page.on('request', (request) => {
        const url = new URL(request.url());
        if (url.hostname.endsWith('plausible.io') || /plausible/i.test(url.pathname))
            sent.push(request.url());
    });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await page.goto(hrefOf('play'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    await page.goto(hrefOf('about'));
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
    expect(sent).toEqual([]);
});
