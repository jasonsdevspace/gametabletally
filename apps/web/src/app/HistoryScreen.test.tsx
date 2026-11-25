import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import { openPlay } from '../play/play.js';
import { openStore } from '../store/store.js';
import { AppFrame } from './AppFrame.js';
import { HistoryScreen } from './HistoryScreen.js';
import { render, screen, within } from './render.testing.js';

/* The history screen in the app's frame, over a database in memory. */

const hand = (numbers: number[], modifiers: string[] = []) => ({ numbers, modifiers, bust: false });
const SEVEN = [12, 11, 10, 9, 8, 7, 6];
const DATES = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });

/**
 * A database holding Ann, Ben and Cat, a game of Flip 7 Ann won, started on the day given, for
 * each day, and a game of Skyjo still in play.
 */
const database = async (finished: readonly string[]) => {
    const factory = new IDBFactory();
    const store = await openStore(factory);
    for (const [id, name] of [
        ['ann', 'Ann'],
        ['ben', 'Ben'],
        ['cat', 'Cat'],
    ] as const)
        await store.savePlayer({ id, name, added: '2026-11-01T10:00:00Z', removed: false });
    let at = '2026-11-01T10:00:00.000Z';
    const play = openPlay(
        store,
        () => at,
        () => Promise.resolve()
    );
    for (const day of finished) {
        at = `${day}T19:00:00.000Z`;
        await play.start({
            id: day,
            game: 'flip-7',
            rules: 1,
            options: {},
            players: ['ann', 'ben', 'cat'],
        });
        for (const ann of [hand(SEVEN, ['x2', '+10']), hand(SEVEN)]) {
            for (const one of [ann, hand([3]), hand([4])]) await play.enter(day, one);
            await play.saveRound(day);
        }
    }
    at = '2026-11-23T19:00:00.000Z';
    await play.start({
        id: 'in-play',
        game: 'skyjo',
        rules: 1,
        options: {},
        players: ['ann', 'ben'],
    });
    await play.settled();
    store.close();
    return () => openStore(factory);
};

const draw = (open: () => ReturnType<typeof openStore>) => {
    window.history.replaceState(null, '', '/history/');
    render(
        <AppFrame screen="history" title="History">
            <HistoryScreen open={open} dates={DATES} />
        </AppFrame>
    );
};

describe('the history', () => {
    it('lists each finished game, newest first, as a link to its recap', async () => {
        draw(await database(['2026-11-14', '2026-11-21']));
        const list = await screen.findByRole('list', { name: 'Finished games' });
        const links = within(list).getAllByRole('link');
        expect(links.map((link) => link.textContent)).toEqual([
            'Ann won, Flip 7, November 21, 2026. Ann, Ben and Cat.›',
            'Ann won, Flip 7, November 14, 2026. Ann, Ben and Cat.›',
        ]);
        expect(links.map((link) => link.getAttribute('href'))).toEqual([
            '/recap/?id=2026-11-21',
            '/recap/?id=2026-11-14',
        ]);
    });

    it('says what will appear there and how to start a game while no game has finished', async () => {
        draw(await database([]));
        expect(
            await screen.findByText(
                'No finished games yet. Each game is listed here once it ends, with its players and who won.'
            )
        ).toBeVisible();
        expect(screen.getByRole('link', { name: 'Start a game' })).toHaveAttribute(
            'href',
            '/play/'
        );
        expect(screen.queryByRole('list', { name: 'Finished games' })).toBeNull();
    });
});
