import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import type { SavedGame } from '../store/format.js';
import { openStore, type Store } from '../store/store.js';
import { type GameInPlay, type NewGame, openPlay, type Play } from './play.js';
import playSource from './play.ts?raw';
import stepsSource from './steps.ts?raw';

/*
 * The games in progress, driven with no screen, over a store on an IndexedDB that lives in
 * memory. A game opened again is opened by a second store over the same database, never the one
 * that wrote it, so what is checked is what was saved.
 */

/** A clock that moves on a second at every reading, so each change is saved at its own time. */
const clock = () => {
    let at = Date.parse('2026-11-14T10:00:00Z');
    return () => {
        at += 1000;
        return new Date(at).toISOString();
    };
};

const setUp = async () => {
    const factory = new IDBFactory();
    const store = await openStore(factory, 'play');
    const play = openPlay(store, clock());
    return { factory, store, play };
};

/** A second look at what was saved: a new store and a new model over the same database. */
const reopenFrom = async (factory: IDBFactory) => {
    const store = await openStore(factory, 'play');
    const play = openPlay(store, clock());
    await play.load();
    return play;
};

const shown = (play: Play, id: string): GameInPlay => {
    const game = play.snapshot().games.find(({ saved }) => saved.id === id);
    if (!game) throw new Error(`no game ${id}`);
    return game;
};

const PLAYERS = ['ann', 'ben', 'cat'];
const newGame = (game: string, id = 'g-1', players = PLAYERS): NewGame => ({
    id,
    game,
    rules: 1,
    options: {},
    players,
});

const hand = (numbers: readonly number[], modifiers: readonly string[] = []) => ({
    numbers,
    modifiers,
    bust: false,
});

/** The record as it sits in the database, read without the store's reader in between. */
const raw = (factory: IDBFactory, id: string): Promise<unknown> =>
    new Promise((resolve, reject) => {
        const opening = factory.open('play');
        opening.onsuccess = () => {
            const request = opening.result.transaction('games').objectStore('games').get(id);
            request.onsuccess = () => {
                const record: unknown = request.result;
                resolve(record);
                opening.result.close();
            };
            request.onerror = () => {
                reject(request.error ?? new Error('not read'));
            };
        };
    });

/** Enters a whole round of Flip 7, seat by seat, and saves it. */
const flipRound = async (play: Play, id: string, hands: readonly unknown[]) => {
    for (const entry of hands) await play.enter(id, entry);
    return play.saveRound(id);
};

describe('a game of each kind, played through the module alone', () => {
    it('plays Flip 7 to its end, scoring each saved round and nothing half entered', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        const big = hand([12, 11, 10, 9, 8, 7, 6], ['x2']);
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'ann' });

        await play.enter('g-1', big);
        // One seat in: the round is not whole, so it scores nothing yet.
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'ben' });
        expect(shown(play, 'g-1').result.totals).toEqual({ ann: 0, ben: 0, cat: 0 });
        expect(shown(play, 'g-1').draft?.ready).toBe(false);

        await play.enter('g-1', hand([1]));
        await play.enter('g-1', hand([2]));
        expect(shown(play, 'g-1').draft?.step).toBeNull();
        expect(shown(play, 'g-1').draft?.ready).toBe(true);
        expect(await play.saveRound('g-1')).toEqual({ saved: true, outcome: null });
        expect(shown(play, 'g-1').result.totals).toEqual({ ann: 141, ben: 1, cat: 2 });
        expect(shown(play, 'g-1').draft).toMatchObject({ index: 1, step: { player: 'ann' } });

        expect(await flipRound(play, 'g-1', [big, hand([1]), hand([2])])).toEqual({
            saved: true,
            outcome: 'ended',
        });
        const over = shown(play, 'g-1');
        expect(over.result.state).toBe('over');
        expect(over.result.winners).toEqual(['ann']);
        expect(over.draft).toBeNull();
    });

    it('plays Skyjo to its end, each seat and then who ended the round', async () => {
        const { play } = await setUp();
        await play.start(newGame('skyjo', 'g-1', ['ann', 'ben']));
        for (const round of [0, 1]) {
            await play.enter('g-1', { total: 60 });
            await play.enter('g-1', { total: 0 });
            expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'ender', player: null });
            // Every seat counted and no ender: not whole, so nothing is scored or doubled.
            expect(shown(play, 'g-1').draft?.ready).toBe(false);
            await play.enter('g-1', 'ben');
            expect(await play.saveRound('g-1')).toEqual({
                saved: true,
                outcome: round === 1 ? 'ended' : null,
            });
        }
        expect(shown(play, 'g-1').result).toMatchObject({
            state: 'over',
            totals: { ann: 120, ben: 0 },
            winners: ['ben'],
        });
    });

    it('plays Wizard to its end, every bid and then every count of tricks', async () => {
        const { play } = await setUp();
        await play.start(newGame('wizard'));
        for (let dealt = 1; dealt <= 20; dealt += 1) {
            expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'bid', player: 'ann' });
            for (const bid of [dealt, 0, 0]) await play.enter('g-1', bid);
            expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'tricks', player: 'ann' });
            for (const tricks of [dealt, 0, 0]) await play.enter('g-1', tricks);
            const saved = await play.saveRound('g-1');
            expect(saved).toEqual({ saved: true, outcome: dealt === 20 ? 'ended' : null });
        }
        expect(shown(play, 'g-1').result).toMatchObject({
            state: 'over',
            totals: { ann: 20 * 20 + 10 * 210, ben: 400, cat: 400 },
            winners: ['ann'],
        });
    });
});

describe('saving every change', () => {
    it('opens a game again at the same round, the same player and the same entry', async () => {
        const { factory, play } = await setUp();
        await play.start(newGame('flip-7'));
        await flipRound(play, 'g-1', [hand([5]), hand([6]), hand([7])]);
        await play.enter('g-1', hand([9]));
        const again = await reopenFrom(factory);
        const game = shown(again, 'g-1');
        expect(game.draft).toMatchObject({
            index: 1,
            step: { part: 'entry', player: 'ben' },
            round: { entries: { ann: hand([9]) } },
        });
        expect(game.result.totals).toEqual({ ann: 5, ben: 6, cat: 7 });
    });

    it('saves a Wizard round between its bids and its tricks', async () => {
        const { factory, play } = await setUp();
        await play.start(newGame('wizard'));
        for (const bid of [1, 0, 0]) await play.enter('g-1', bid);
        const again = await reopenFrom(factory);
        expect(shown(again, 'g-1').draft).toMatchObject({
            step: { part: 'tricks', player: 'ann' },
            round: { entries: { ann: { bid: 1 }, ben: { bid: 0 }, cat: { bid: 0 } } },
        });
        expect(shown(again, 'g-1').draft?.preview.rounds[0]?.state).toBe('open');
    });

    it('keeps no total or score in the record, and only saved rounds among its rounds', async () => {
        const { factory, play } = await setUp();
        await play.start(newGame('flip-7'));
        await flipRound(play, 'g-1', [hand([5]), hand([6]), hand([7])]);
        await play.enter('g-1', hand([9]));
        const record = await raw(factory, 'g-1');
        expect(Object.keys(record ?? {}).sort()).toEqual(
            [
                'changed',
                'draft',
                'game',
                'id',
                'options',
                'players',
                'rounds',
                'rules',
                'started',
            ].sort()
        );
        expect(record).toMatchObject({
            rounds: [{ entries: { ann: hand([5]), ben: hand([6]), cat: hand([7]) }, out: [] }],
        });
        expect(JSON.stringify(record)).not.toMatch(/total|score|winner|leader/);
    });

    it('carries on two games in play, each at its own step', async () => {
        const { factory, play } = await setUp();
        await play.start(newGame('flip-7', 'g-flip'));
        await play.start(newGame('wizard', 'g-wizard'));
        await play.enter('g-flip', hand([3]));
        for (const bid of [1, 0, 0]) await play.enter('g-wizard', bid);
        await play.enter('g-wizard', 1);
        const again = await reopenFrom(factory);
        expect(shown(again, 'g-flip').draft?.step).toEqual({ part: 'entry', player: 'ben' });
        expect(shown(again, 'g-wizard').draft?.step).toEqual({ part: 'tricks', player: 'ben' });
    });

    it('reports a save the store refuses, and keeps the entry to save again', async () => {
        const factory = new IDBFactory();
        const real = await openStore(factory, 'play');
        let refuse = false;
        const store: Store = {
            ...real,
            saveGame: async (game: SavedGame) => {
                if (refuse) throw new Error('The phone is out of room.');
                await real.saveGame(game);
            },
        };
        const play = openPlay(store, clock());
        await play.start(newGame('flip-7'));
        refuse = true;
        await play.enter('g-1', hand([4]));
        expect(shown(play, 'g-1').error).toBe('The phone is out of room.');
        expect(shown(play, 'g-1').draft?.round).toMatchObject({ entries: { ann: hand([4]) } });
        expect((await reopenFrom(factory)).snapshot().games[0]?.draft?.round).toEqual({
            entries: {},
            out: [],
        });
        refuse = false;
        await play.retry('g-1');
        expect(shown(play, 'g-1').error).toBeNull();
        expect(shown(await reopenFrom(factory), 'g-1').draft?.round).toMatchObject({
            entries: { ann: hand([4]) },
        });
    });
});

describe('a round half entered', () => {
    it.each([
        ['flip-7', [hand([12, 11, 10, 9, 8, 7, 6], ['x2'])]],
        ['skyjo', [{ total: 142 }, { total: 0 }, { total: 0 }]],
        ['wizard', [1, 0, 0, 1]],
    ])('scores nothing and ends no game in %s', async (game, entries) => {
        const { play } = await setUp();
        await play.start(newGame(game));
        for (const entry of entries) await play.enter('g-1', entry);
        const shownGame = shown(play, 'g-1');
        expect(shownGame.result.state).toBe('in-play');
        expect(shownGame.result.rounds).toEqual([]);
        expect(Object.values(shownGame.result.totals)).toEqual([0, 0, 0]);
        expect(shownGame.draft?.preview.state).toBe('in-play');
        expect(Object.values(shownGame.draft?.preview.totals ?? {})).toEqual([0, 0, 0]);
    });
});

describe('undo', () => {
    it('puts back exactly what was there after an entry, a saved round and a discard', async () => {
        const { factory, play } = await setUp();
        await play.start(newGame('flip-7'));
        const fresh = shown(play, 'g-1').saved;

        await play.enter('g-1', hand([4]));
        expect(play.snapshot().undo).toEqual({ kind: 'entry', game: 'g-1' });
        await play.undo();
        expect(shown(play, 'g-1').saved).toEqual(fresh);
        expect(await raw(factory, 'g-1')).toEqual(fresh);
        expect(play.snapshot().undo).toBeNull();

        for (const entry of [hand([4]), hand([5]), hand([6])]) await play.enter('g-1', entry);
        const whole = shown(play, 'g-1').saved;
        await play.saveRound('g-1');
        expect(play.snapshot().undo).toEqual({ kind: 'round', game: 'g-1' });
        await play.undo();
        expect(shown(play, 'g-1').saved).toEqual(whole);

        await play.discard('g-1');
        expect(play.snapshot().games).toEqual([]);
        expect(await raw(factory, 'g-1')).toBeUndefined();
        await play.undo();
        expect(shown(play, 'g-1').saved).toEqual(whole);
        expect(await raw(factory, 'g-1')).toEqual(whole);
    });

    it('puts back a finished game that was deleted, and offers no undo after a reload', async () => {
        const { factory, play } = await setUp();
        await play.start(newGame('skyjo', 'g-1', ['ann', 'ben']));
        await play.enter('g-1', { total: 100 });
        await play.enter('g-1', { total: 0 });
        await play.enter('g-1', 'ben');
        await play.saveRound('g-1');
        const finished = shown(play, 'g-1').saved;
        expect(shown(play, 'g-1').result.state).toBe('over');
        await play.discard('g-1');
        expect((await reopenFrom(factory)).snapshot().games).toEqual([]);
        await play.undo();
        expect(await raw(factory, 'g-1')).toEqual(finished);

        await play.discard('g-1');
        const again = await reopenFrom(factory);
        expect(again.snapshot().undo).toBeNull();
        await again.undo();
        expect(again.snapshot().games).toEqual([]);
    });

    it('is forgotten when its toast goes', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await play.enter('g-1', hand([4]));
        play.dismissUndo();
        expect(play.snapshot().undo).toBeNull();
        await play.undo();
        expect(shown(play, 'g-1').draft?.round).toMatchObject({ entries: { ann: hand([4]) } });
    });
});

describe('a reopened round', () => {
    const twoRounds = async () => {
        const setup = await setUp();
        await setup.play.start(newGame('flip-7'));
        await flipRound(setup.play, 'g-1', [hand([5]), hand([6]), hand([7])]);
        await flipRound(setup.play, 'g-1', [hand([1]), hand([2]), hand([3])]);
        return setup;
    };

    it('can be changed and saved, and every total after it is the changed game scored', async () => {
        const { play } = await twoRounds();
        await play.reopen('g-1', 0);
        expect(shown(play, 'g-1').draft).toMatchObject({
            index: 0,
            step: { part: 'entry', player: 'ann' },
        });
        await play.enter('g-1', hand([11]));
        // The saved round stays as it was until the draft is saved.
        expect(shown(play, 'g-1').result.totals).toEqual({ ann: 6, ben: 8, cat: 10 });
        expect(await play.saveRound('g-1')).toEqual({ saved: true, outcome: null });
        expect(shown(play, 'g-1').result.totals).toEqual({ ann: 12, ben: 8, cat: 10 });
        expect(shown(play, 'g-1').saved.rounds).toHaveLength(2);
        expect(shown(play, 'g-1').draft).toMatchObject({ index: 2 });
    });

    it('changes nothing saved when it is left without saving', async () => {
        const { factory, play } = await twoRounds();
        const before = shown(play, 'g-1').saved;
        await play.reopen('g-1', 1);
        await play.enter('g-1', hand([12]));
        await play.dropDraft('g-1');
        const after = (await reopenFrom(factory)).snapshot().games[0]?.saved;
        expect(after?.rounds).toEqual(before.rounds);
        expect(after?.draft).toEqual(before.draft);
    });

    it('reports a change that ends the game, and one that puts a finished game back in play', async () => {
        const { play } = await setUp();
        await play.start(newGame('skyjo', 'g-1', ['ann', 'ben']));
        await play.enter('g-1', { total: 50 });
        await play.enter('g-1', { total: 0 });
        await play.enter('g-1', 'ben');
        await play.saveRound('g-1');
        await play.reopen('g-1', 0);
        await play.goTo('g-1', { part: 'entry', player: 'ann' });
        await play.enter('g-1', { total: 100 });
        expect(await play.saveRound('g-1')).toEqual({ saved: true, outcome: 'ended' });
        expect(shown(play, 'g-1').draft).toBeNull();

        await play.reopen('g-1', 0);
        await play.enter('g-1', { total: 40 });
        expect(await play.saveRound('g-1')).toEqual({ saved: true, outcome: 'resumed' });
        expect(shown(play, 'g-1').draft).toMatchObject({ index: 1 });
    });

    it('waits while a round being entered holds anything', async () => {
        const { play } = await twoRounds();
        await play.enter('g-1', hand([1]));
        await expect(play.reopen('g-1', 0)).rejects.toThrow(/round being entered/);
    });
});

describe('players out of a round', () => {
    it('are passed over, and what they had entered is taken out', async () => {
        const { play } = await setUp();
        await play.start(newGame('skyjo'));
        await play.enter('g-1', { total: 4 });
        await play.setOut('g-1', ['ann']);
        const draft = shown(play, 'g-1').draft;
        expect(draft?.playing).toEqual(['ben', 'cat']);
        expect(draft?.round).toEqual({ entries: {}, out: ['ann'] });
        expect(draft?.step).toEqual({ part: 'entry', player: 'ben' });
        await play.enter('g-1', { total: 3 });
        await play.enter('g-1', { total: 9 });
        await play.enter('g-1', 'ben');
        await play.saveRound('g-1');
        expect(shown(play, 'g-1').result).toMatchObject({
            totals: { ann: 0, ben: 3, cat: 9 },
            missed: ['ann'],
        });
    });
});

describe('leaving a game', () => {
    it('keeps it as it is to carry on, and a discarded game is gone until the discard is undone', async () => {
        const { factory, play } = await setUp();
        await play.start(newGame('flip-7'));
        await play.enter('g-1', hand([4]));
        const later = await reopenFrom(factory);
        await later.enter('g-1', hand([5]));
        expect(shown(later, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'cat' });
        await later.discard('g-1');
        expect(await raw(factory, 'g-1')).toBeUndefined();
        await later.undo();
        expect(await raw(factory, 'g-1')).toMatchObject({ id: 'g-1' });
    });
});

describe('the module', () => {
    it("keeps one snapshot until something changes, and tells each listener when it does, as React's hook for an outside store needs", async () => {
        const { play } = await setUp();
        let heard = 0;
        const stop = play.subscribe(() => {
            heard += 1;
        });
        await play.start(newGame('flip-7'));
        const first = play.snapshot();
        expect(play.snapshot()).toBe(first);
        await play.enter('g-1', hand([4]));
        expect(play.snapshot()).not.toBe(first);
        expect(heard).toBe(2);
        stop();
        await play.enter('g-1', hand([5]));
        expect(heard).toBe(2);
    });

    it('imports nothing that draws', () => {
        for (const source of [playSource, stepsSource]) {
            const imports = [...source.matchAll(/from '([^']+)'/g)].map((match) => match[1]);
            expect(imports.filter((name) => /react|\.tsx$/.test(name ?? ''))).toEqual([]);
        }
    });
});
