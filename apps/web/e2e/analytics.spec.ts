import { DOMAIN, KEPT, MOST_KEPT } from '../src/analytics.js';
import { newGameOf } from '../src/app/PlayStart.js';
import { hrefOf } from '../src/routes.js';
import type { SavedPlayer } from '../src/store/format.js';
import { buildGame, expect, type Page, seed, test } from './support.js';

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
        if (url.hostname === 'plausible.io' || /plausible/i.test(url.pathname))
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

/*
 * The count as it runs on the live address: the build served at gametabletally.com in the browser,
 * with every request to Plausible caught and answered here, so the tracker runs as it does for a
 * visitor and nothing reaches Plausible itself.
 */

const LIVE = `https://${DOMAIN}`;

/** What one request to Plausible held, as the browser sent it. */
interface Sent {
    readonly url: string;
    readonly body: string;
    readonly cookie: string | undefined;
}

/**
 * Serves the build at the live address, and answers Plausible, or refuses as a lost connection
 * would while the connection is off. Returns every request made to Plausible, every event that
 * reached it, and a switch for the connection, which turns the browser's connection off and on as
 * well, and waits until every open page says so.
 */
const onTheLiveAddress = async (page: Page, baseURL: string | undefined) => {
    const requests: Sent[] = [];
    const reached: { n: string; p: unknown }[] = [];
    let connected = true;
    // The tracker counts nothing in a browser a test drives, unless the page says it is one of
    // Plausible's own checks.
    const context = page.context();
    await context.addInitScript(() => {
        Object.assign(window, { __plausible: true });
    });
    context.on('request', (request) => {
        const url = new URL(request.url());
        if (url.hostname === 'plausible.io' || /plausible/i.test(url.pathname))
            requests.push({
                url: request.url(),
                body: request.postData() ?? '',
                cookie: request.headers()['cookie'],
            });
    });
    await context.route(`${LIVE}/**`, async (route) => {
        const { pathname, search } = new URL(route.request().url());
        const response = await route.fetch({ url: new URL(`${pathname}${search}`, baseURL).href });
        await route.fulfill({ response });
    });
    await context.route('https://plausible.io/**', async (route) => {
        if (!connected) {
            await route.abort('internetdisconnected');
            return;
        }
        const event: unknown = route.request().postDataJSON();
        if (typeof event === 'object' && event !== null && 'n' in event)
            reached.push({ n: String(event.n), p: 'p' in event ? event.p : undefined });
        await route.fulfill({ status: 202, body: 'ok' });
    });
    return {
        requests,
        /**
         * The events the app counts that reached Plausible, by name and what they carry, leaving
         * out page views and the time on a page the tracker sends with them.
         */
        events: () =>
            reached
                .filter(({ n }) => n !== 'pageview' && n !== 'engagement')
                .map(({ n, p }) => ({ n, p })),
        connect: async (on: boolean) => {
            connected = on;
            await context.setOffline(!on);
            // Each open page hears the change in its own time, so the test goes on once every
            // page says it, as a phone's pages have by the time anyone acts.
            for (const each of context.pages())
                await expect.poll(() => each.evaluate(() => navigator.onLine)).toBe(on);
        },
    };
};

/** The page open and running at an address of the live site. */
const open = async (page: Page, path: string) => {
    await page.goto(`${LIVE}${path}`);
    await expect(page.locator('html')).toHaveAttribute('data-ready', 'true');
};

const savedPlayer = (id: string, name: string): SavedPlayer => ({
    id,
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const PLAYERS = [
    savedPlayer('p-zelda', 'Zelda Quimby'),
    savedPlayer('p-xavier', 'Xavier Oduya'),
    savedPlayer('p-wren', 'Wren Halvorsen'),
];

/** Starts a game of Flip 7 from the new game screen, with the saved players, and gives its id. */
const startFlip7 = async (page: Page): Promise<string> => {
    await open(page, newGameOf('flip-7'));
    for (const { name } of PLAYERS) await page.getByRole('button', { name: `Add ${name}` }).click();
    const start = page.getByRole('region', { name: 'Actions' }).getByRole('button', {
        name: 'Start the game',
    });
    // A press made while the button is off is dropped, so it is pressed once it is live.
    await expect(start).not.toHaveAttribute('aria-disabled');
    await start.click();
    await expect(page).toHaveURL(/\/game\/\?id=[\w-]+$/);
    return new URL(page.url()).searchParams.get('id') ?? '';
};

test("counts a game started and a game finished by the game's name alone, and sends no name, score or id", async ({
    page,
    baseURL,
}, info) => {
    test.skip(info.project.name !== 'phone', 'A game is played on a phone.');
    const plausible = await onTheLiveAddress(page, baseURL);
    const hand = (numbers: readonly number[], modifiers: readonly string[] = []) => ({
        numbers,
        modifiers,
        bust: false,
    });
    // A game one round from its end: Zelda leads with 141.
    const nearly = await buildGame(
        {
            id: 'game-7d1e9a',
            game: 'flip-7',
            rules: 1,
            options: {},
            players: PLAYERS.map(({ id }) => id),
        },
        async (model) => {
            await model.enter('game-7d1e9a', hand([12, 11, 10, 9, 8, 7, 6], ['x2']));
            await model.enter('game-7d1e9a', hand([1]));
            await model.enter('game-7d1e9a', hand([2]));
            await model.saveRound('game-7d1e9a');
        }
    );
    await open(page, '/');
    await seed(page, [nearly], PLAYERS);

    const started = await startFlip7(page);
    // The start reaches Plausible before the page is left, so leaving never races its send.
    await expect.poll(plausible.events).toEqual([{ n: 'Game started', p: { game: 'Flip 7' } }]);

    // The last round takes Zelda past two hundred, which ends the game.
    await open(page, hrefOf('game', nearly.id));
    const key = (name: string) => page.getByRole('button', { name, exact: true });
    const dock = page.getByRole('region', { name: 'Actions' });
    for (const card of ['12', '11', '10', '9', '8', '7', '6']) await key(card).click();
    await dock.getByRole('button', { name: 'Next: Xavier Oduya' }).click();
    await key('4').click();
    await dock.getByRole('button', { name: 'Next: Wren Halvorsen' }).click();
    await key('1').click();
    const save = dock.getByRole('button', { name: 'Save the round' });
    await expect(save).not.toHaveAttribute('aria-disabled');
    await save.click();
    await expect(page.getByText('Zelda Quimby wins with 219.')).toBeVisible();

    await expect.poll(plausible.events).toEqual([
        { n: 'Game started', p: { game: 'Flip 7' } },
        { n: 'Game finished', p: { game: 'Flip 7' } },
    ]);
    const never = [
        ...PLAYERS.flatMap(({ id, name }) => [id, name, ...name.split(' ')]),
        nearly.id,
        started,
        '141',
        '219',
    ];
    expect(plausible.requests.length).toBeGreaterThan(0);
    for (const { url, body, cookie } of plausible.requests) {
        for (const words of never) {
            expect(url).not.toContain(words);
            expect(body).not.toContain(words);
        }
        expect(cookie).toBeUndefined();
    }
    expect(await page.context().cookies()).toEqual([]);
});

test('counts an install where the browser reports one, with nothing beside it', async ({
    page,
    baseURL,
}) => {
    const plausible = await onTheLiveAddress(page, baseURL);
    await open(page, hrefOf('install'));
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect.poll(plausible.events).toEqual([{ n: 'Install', p: undefined }]);
});

test('keeps a game started with no connection on the phone, and sends it when the connection returns', async ({
    page,
    baseURL,
}) => {
    const plausible = await onTheLiveAddress(page, baseURL);
    await open(page, '/');
    await seed(page, [], PLAYERS);
    await open(page, newGameOf('flip-7'));
    await plausible.connect(false);
    const kept = () =>
        page.evaluate((key) => {
            const read: unknown = JSON.parse(localStorage.getItem(key) ?? '[]');
            return Array.isArray(read)
                ? read.map((entry: { n?: unknown; g?: unknown }) =>
                      entry.g === undefined ? [entry.n] : [entry.n, entry.g]
                  )
                : [];
        }, KEPT);
    for (const { name } of PLAYERS) await page.getByRole('button', { name: `Add ${name}` }).click();
    const start = page.getByRole('button', { name: 'Start the game' });
    await expect(start).not.toHaveAttribute('aria-disabled');
    await start.click();
    await expect(page).toHaveURL(/\/game\/\?id=/);
    await expect.poll(kept).toEqual([['Game started', 'Flip 7']]);
    expect(plausible.events()).toEqual([]);

    await plausible.connect(true);
    await expect.poll(plausible.events).toEqual([{ n: 'Game started', p: { game: 'Flip 7' } }]);
    await expect.poll(kept).toEqual([]);
});

test('keeps events made with no connection up to the limit, and drops the newest past it', async ({
    page,
    baseURL,
}) => {
    const plausible = await onTheLiveAddress(page, baseURL);
    await open(page, '/');
    await seed(page, [], PLAYERS);
    await open(page, newGameOf('flip-7'));
    await plausible.connect(false);
    // The phone holds as many events as it keeps already, each of a finished game of Skyjo.
    await page.evaluate(
        ({ key, most }) => {
            localStorage.setItem(
                key,
                JSON.stringify(
                    Array.from({ length: most }, (_, at) => ({
                        i: `e${at}`,
                        n: 'Game finished',
                        g: 'Skyjo',
                    }))
                )
            );
        },
        { key: KEPT, most: MOST_KEPT }
    );
    for (const { name } of PLAYERS) await page.getByRole('button', { name: `Add ${name}` }).click();
    const start = page.getByRole('button', { name: 'Start the game' });
    await expect(start).not.toHaveAttribute('aria-disabled');
    await start.click();
    await expect(page).toHaveURL(/\/game\/\?id=/);

    await plausible.connect(true);
    await expect.poll(() => plausible.events().length).toBe(MOST_KEPT);
    expect(plausible.events()).toEqual(
        Array.from({ length: MOST_KEPT }, () => ({ n: 'Game finished', p: { game: 'Skyjo' } }))
    );
});

test('sends events kept by two open pages once each when the connection returns', async ({
    page,
    baseURL,
}) => {
    const plausible = await onTheLiveAddress(page, baseURL);
    const other = await page.context().newPage();
    await open(page, hrefOf('install'));
    await open(other, hrefOf('about'));
    await plausible.connect(false);
    for (const each of [page, other])
        await each.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await expect
        .poll(() => page.evaluate((key) => localStorage.getItem(key), KEPT))
        .toContain('Install');
    await plausible.connect(true);
    await expect.poll(plausible.events).toEqual([
        { n: 'Install', p: undefined },
        { n: 'Install', p: undefined },
    ]);
    // Neither page sends either event again once both have heard the connection is back.
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 500)));
    expect(plausible.events()).toHaveLength(2);
});
