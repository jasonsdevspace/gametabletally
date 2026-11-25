import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';

import { openPlay } from '../play/play.js';
import type { SavedGame, SavedPlayer } from '../store/format.js';
import { openStore, type Store } from '../store/store.js';
import { AppFrame } from './AppFrame.js';
import { PlayerPage } from './PlayerPage.js';
import { PLAYERS_CHANGED } from './players.js';
import {
    act,
    appLine,
    cleanup,
    fireEvent,
    render,
    screen,
    waitFor,
    within,
} from './render.testing.js';
import { heard, refused, refusedInPlace } from './status.testing.js';

/* A player's own page in the app's frame, over a database in memory. */

const player = (id: string, name: string, removed = false): SavedPlayer => ({
    id,
    name,
    added: '2026-11-01T10:00:00Z',
    removed,
});

/** A database with Ann, who has played a game with Ben, and Cat, who has played none. */
const draw = async (
    id: string,
    wrap: (open: () => Promise<Store>) => () => Promise<Store> = (open) => open,
    navigates = false,
    games: readonly SavedGame[] = []
) => {
    window.history.replaceState(null, '', `/player/?id=${id}`);
    const factory = new IDBFactory();
    const store = await openStore(factory);
    for (const one of [player('ann', 'Ann'), player('ben', 'Ben'), player('cat', 'Cat')])
        await store.savePlayer(one);
    await openPlay(store, undefined, () => Promise.resolve()).start({
        id: 'g-1',
        game: 'skyjo',
        rules: 1,
        options: {},
        players: ['ann', 'ben'],
    });
    for (const game of games) await store.saveGame(game);
    store.close();
    const open = () => openStore(factory);
    const went: string[] = [];
    render(
        <AppFrame screen="player" title="Player">
            {navigates ? (
                <PlayerPage open={wrap(open)} />
            ) : (
                <PlayerPage
                    open={wrap(open)}
                    go={(href) => {
                        went.push(href);
                    }}
                />
            )}
        </AppFrame>
    );
    return { open, went };
};

/** A finished game as the store saves it, between the players given. */
const finished = (
    id: string,
    game: string,
    players: readonly string[],
    rounds: readonly unknown[]
): SavedGame => ({
    id,
    game,
    rules: 1,
    options: {},
    players,
    rounds,
    draft: null,
    started: '2026-11-20T19:00:00Z',
    changed: '2026-11-20T21:00:00Z',
});

/** Skyjo in two rounds, which Cat wins on 32 as Ben passes a hundred. */
const SKYJO = finished(
    's-1',
    'skyjo',
    ['cat', 'ben'],
    [
        { entries: { cat: { total: 20 }, ben: { total: 55 } }, ender: 'cat' },
        { entries: { cat: { total: 12 }, ben: { total: 48 } }, ender: 'cat' },
    ]
);

const SEVEN = [12, 11, 10, 9, 8, 7, 6];
const hand = (numbers: number[], modifiers: string[] = []) => ({ numbers, modifiers, bust: false });

/** Flip 7 in two rounds, which Cat wins on 229. */
const FLIP_7 = finished(
    'f-1',
    'flip-7',
    ['cat', 'ben', 'ann'],
    [hand(SEVEN, ['x2', '+10']), hand(SEVEN)].map((strong) => ({
        entries: { cat: strong, ben: hand([1]), ann: hand([2]) },
    }))
);

/** A game this build has no rules for, which the record cannot score. */
const UNKNOWN = finished('u-1', 'no-such-game', ['cat', 'ben'], []);

const IN_PLAY = 'A game in play counts once it ends.';

const players = async (open: () => ReturnType<typeof openStore>) => {
    const store = await open();
    const saved = await store.players();
    store.close();
    return saved;
};

const nameField = () => screen.getByRole('textbox', { name: 'Name' });
const line = appLine;

/** The frame's toast, which shows its message and its Undo. */
const toast = () => within(document.querySelector<HTMLElement>('.dk-toast') ?? document.body);

afterEach(() => {
    window.history.replaceState(null, '', '/');
});

describe("a player's page", () => {
    it('names the player, and counts a game they have in play in no record', async () => {
        await draw('ann');
        expect(await screen.findByRole('heading', { name: 'Ann' })).toBeVisible();
        expect(screen.queryByRole('table')).toBeNull();
        expect(screen.getByText(/^No finished games yet\./)).toHaveTextContent(
            'A game in play counts once it ends.'
        );
        expect(nameField()).toHaveValue('Ann');
    });

    it('says what will appear for a player who has played nothing, and how to start a game', async () => {
        await draw('cat');
        await screen.findByRole('heading', { name: 'Cat' });
        expect(screen.getByText(/^No finished games yet\./)).toHaveTextContent(
            'No finished games yet. Once Cat finishes a game, how many Cat has played and won, the best total and the average show here, game by game.'
        );
        expect(screen.getByText(/^No finished games yet\./)).not.toHaveTextContent('in play');
        expect(screen.getByRole('link', { name: 'Start a game' })).toHaveAttribute(
            'href',
            '/play/'
        );
    });

    it('says under the record that a game in play counts once it ends, while the player has one', async () => {
        await draw('ann', undefined, false, [FLIP_7]);
        const table = await screen.findByRole('table', { name: 'Record' });
        expect(screen.getByText(IN_PLAY)).toBeVisible();
        expect(table).not.toContainElement(screen.getByText(IN_PLAY));
        expect(table).toHaveClass('dk-table', 'dk-table-pinned');
    });

    it('says nothing of a game in play under the record of a player who has none', async () => {
        await draw('cat', undefined, false, [FLIP_7]);
        await screen.findByRole('table', { name: 'Record' });
        expect(screen.queryByText(IN_PLAY)).toBeNull();
    });

    it('takes no game the record cannot score for a game in play', async () => {
        await draw('cat', undefined, false, [UNKNOWN]);
        await screen.findByText(/^No finished games yet\./);
        expect(screen.getByText(/^No finished games yet\./)).not.toHaveTextContent('in play');
    });

    it('describes the record by its note where the lowest total wins a game in it, and only there', async () => {
        await draw('cat', undefined, false, [SKYJO]);
        expect(await screen.findByRole('table', { name: 'Record' })).toHaveAccessibleDescription(
            'In Skyjo the lowest total wins, so the best there is the lowest.'
        );
        cleanup();
        await draw('cat', undefined, false, [FLIP_7]);
        expect(await screen.findByRole('table', { name: 'Record' })).not.toHaveAttribute(
            'aria-describedby'
        );
    });

    it('renames the player as the field is left, and says so', async () => {
        const { open } = await draw('ann');
        await screen.findByRole('heading', { name: 'Ann' });
        fireEvent.change(nameField(), { target: { value: ' Annie ' } });
        fireEvent.blur(nameField());
        await heard(line(), 'Saved as Annie.');
        expect(screen.getByRole('heading', { name: 'Annie' })).toBeVisible();
        expect((await players(open)).find(({ id }) => id === 'ann')?.name).toBe('Annie');
    });

    it('refuses an empty name and one already taken beside the field, saving nothing', async () => {
        const { open } = await draw('ann');
        await screen.findByRole('heading', { name: 'Ann' });
        fireEvent.change(nameField(), { target: { value: '  ' } });
        fireEvent.blur(nameField());
        // Said as well as drawn, since the field may have been left as the refusal arrives.
        await refused(nameField(), line(), "Enter the player's name.");
        fireEvent.change(nameField(), { target: { value: 'BEN' } });
        // Enter is pressed in the field, where focus is.
        nameField().focus();
        fireEvent.submit(nameField());
        await refusedInPlace(nameField(), 'A player is already named Ben.');
        expect((await players(open)).find(({ id }) => id === 'ann')?.name).toBe('Ann');
    });

    it('removes a player at once, goes to the players screen and offers Undo, which puts them back as they were', async () => {
        const { open, went } = await draw('cat');
        fireEvent.click(await screen.findByRole('button', { name: 'Remove Cat' }));
        await waitFor(() => {
            expect(went).toEqual(['/players/']);
        });
        // Cat had played no game, so the store deleted them.
        expect((await players(open)).map(({ id }) => id)).toEqual(['ann', 'ben']);
        expect(toast().getByText('Cat removed.')).toBeInTheDocument();
        let changed = false;
        window.addEventListener(
            PLAYERS_CHANGED,
            () => {
                changed = true;
            },
            { once: true }
        );
        fireEvent.click(toast().getByRole('button', { name: 'Undo' }));
        await waitFor(() => {
            expect(changed).toBe(true);
        });
        expect(await players(open)).toContainEqual(player('cat', 'Cat'));
    });

    it('keeps a removed player who has played, marked removed, and Undo takes the mark away', async () => {
        const { open } = await draw('ann');
        fireEvent.click(await screen.findByRole('button', { name: 'Remove Ann' }));
        await waitFor(async () => {
            expect((await players(open)).find(({ id }) => id === 'ann')?.removed).toBe(true);
        });
        fireEvent.click(toast().getByRole('button', { name: 'Undo' }));
        await waitFor(async () => {
            expect((await players(open)).find(({ id }) => id === 'ann')).toEqual(
                player('ann', 'Ann')
            );
        });
    });

    it('says there is no player at an address that names none, with the way to all players', async () => {
        await draw('nobody');
        expect(await screen.findByText(/There is no player at this address/)).toBeVisible();
        expect(
            within(screen.getByRole('main')).getByRole('link', { name: 'All players' })
        ).toHaveAttribute('href', '/players/');
    });

    it('carries a way back to all players in the bar', async () => {
        await draw('ann');
        await act(() => Promise.resolve());
        expect(
            within(screen.getByRole('banner')).getByRole('link', { name: 'All players' })
        ).toHaveAttribute('href', '/players/');
    });

    it('removes the player as last renamed, when Remove is pressed as the rename saves', async () => {
        const { open } = await draw('ann');
        await screen.findByRole('heading', { name: 'Ann' });
        fireEvent.change(nameField(), { target: { value: 'Annie' } });
        fireEvent.blur(nameField());
        fireEvent.click(screen.getByRole('button', { name: 'Remove Ann' }));
        await waitFor(() => {
            expect(toast().getByText('Annie removed.')).toBeInTheDocument();
        });
        expect((await players(open)).find(({ id }) => id === 'ann')).toEqual({
            ...player('ann', 'Annie'),
            removed: true,
        });
        fireEvent.click(toast().getByRole('button', { name: 'Undo' }));
        await waitFor(async () => {
            expect((await players(open)).find(({ id }) => id === 'ann')).toEqual(
                player('ann', 'Annie')
            );
        });
    });

    it('removes once, however quickly Remove is pressed twice', async () => {
        const { went } = await draw('cat');
        const remove = await screen.findByRole('button', { name: 'Remove Cat' });
        fireEvent.click(remove);
        fireEvent.click(remove);
        await waitFor(() => {
            expect(went).toEqual(['/players/']);
        });
        await act(() => new Promise((resolve) => setTimeout(resolve, 50)));
        expect(went).toEqual(['/players/']);
    });

    it('goes to the players screen in the removed player’s place, so Back does not lead to no one', async () => {
        await draw('cat', undefined, true);
        const entries = window.history.length;
        fireEvent.click(await screen.findByRole('button', { name: 'Remove Cat' }));
        await waitFor(() => {
            expect(window.location.pathname).toBe('/players/');
        });
        expect(window.history.length).toBe(entries);
    });

    it('puts no one back whose name another player has taken since, and says why', async () => {
        const { open } = await draw('cat');
        fireEvent.click(await screen.findByRole('button', { name: 'Remove Cat' }));
        await waitFor(() => {
            expect(toast().getByText('Cat removed.')).toBeInTheDocument();
        });
        const store = await open();
        await store.savePlayer({ ...player('cat-2', 'Cat'), added: '2026-11-02T10:00:00Z' });
        store.close();
        fireEvent.click(toast().getByRole('button', { name: 'Undo' }));
        await waitFor(() => {
            expect(
                toast().getByText('Cat could not be put back, since another player has the name.')
            ).toBeInTheDocument();
        });
        expect((await players(open)).filter(({ name }) => name === 'Cat')).toHaveLength(1);
    });

    it('saves a name typed while another saves, after it', async () => {
        let release: () => void = () => undefined;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        let saves = 0;
        const { open } = await draw('ann', (opener) => async () => {
            const store = await opener();
            return {
                ...store,
                savePlayer: async (one) => {
                    saves += 1;
                    if (saves === 1) await held;
                    await store.savePlayer(one);
                },
            };
        });
        await screen.findByRole('heading', { name: 'Ann' });
        fireEvent.change(nameField(), { target: { value: 'Annie' } });
        fireEvent.submit(nameField());
        fireEvent.change(nameField(), { target: { value: 'Anna' } });
        fireEvent.blur(nameField());
        release();
        expect(await screen.findByRole('heading', { name: 'Anna' })).toBeVisible();
        expect((await players(open)).find(({ id }) => id === 'ann')?.name).toBe('Anna');
    });
});
