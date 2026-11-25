import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';

import type { SavedGame } from '../store/format.js';
import { openStore, type Store } from '../store/store.js';
import { type GameInPlay, type NewGame, openPlay, type Play } from './play.js';
import playSource from './play.ts?raw';
import { toDraftRound } from './steps.js';
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

/**
 * A record as it was entered, without the time it was saved at. Undo puts back what was entered
 * and saves it at the time it is put back, so a backup taken before it does not win a merge.
 */
const entered = (record: unknown): unknown =>
    typeof record === 'object' && record !== null ? { ...record, changed: 'any time' } : record;

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

    it('keeps a hand tapped in without moving on, and comes back to it opened again', async () => {
        const { factory, play } = await setUp();
        await play.start(newGame('flip-7'));
        await play.hold('g-1', hand([3]));
        await play.hold('g-1', hand([3, 7], ['+4']));
        const held = shown(play, 'g-1').draft;
        expect(held?.step).toEqual({ part: 'entry', player: 'ann' });
        expect(held?.round.entries['ann']).toEqual(hand([3, 7], ['+4']));
        expect(held?.preview.rounds[0]?.scores['ann']).toBe(14);
        expect(play.snapshot().undo).toBeNull();
        const again = await reopenFrom(factory);
        expect(shown(again, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'ann' });
        expect(shown(again, 'g-1').draft?.round.entries['ann']).toEqual(hand([3, 7], ['+4']));
        // Entered, the hand moves the round on to the next seat.
        await again.enter('g-1', hand([3, 7], ['+4']));
        expect(shown(again, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'ben' });
    });

    it('leaves the last undo in place through a hand tapped in, still taking the game back', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await play.enter('g-1', hand([3]));
        await play.hold('g-1', hand([9]));
        expect(play.snapshot().undo).toEqual({ kind: 'entry', game: 'g-1' });
        expect(await play.undo()).toBe(true);
        const back = shown(play, 'g-1').draft;
        expect(back?.step).toEqual({ part: 'entry', player: 'ann' });
        expect(back?.round.entries).toEqual({});
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
        expect(entered(shown(play, 'g-1').saved)).toEqual(entered(fresh));
        expect(entered(await raw(factory, 'g-1'))).toEqual(entered(fresh));
        expect(play.snapshot().undo).toBeNull();
        expect(shown(play, 'g-1').saved.changed > fresh.changed).toBe(true);

        for (const entry of [hand([4]), hand([5]), hand([6])]) await play.enter('g-1', entry);
        const whole = shown(play, 'g-1').saved;
        await play.saveRound('g-1');
        expect(play.snapshot().undo).toEqual({ kind: 'round', game: 'g-1' });
        await play.undo();
        expect(entered(shown(play, 'g-1').saved)).toEqual(entered(whole));

        await play.discard('g-1');
        expect(play.snapshot().games).toEqual([]);
        expect(await raw(factory, 'g-1')).toBeUndefined();
        await play.undo();
        expect(entered(shown(play, 'g-1').saved)).toEqual(entered(whole));
        expect(entered(await raw(factory, 'g-1'))).toEqual(entered(whole));
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
        expect(entered(await raw(factory, 'g-1'))).toEqual(entered(finished));

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

    it('is put back by Undo as it was saved, with the round in play as it was before it was opened', async () => {
        const { play } = await twoRounds();
        const before = shown(play, 'g-1').saved;
        await play.reopen('g-1', 0);
        await play.enter('g-1', hand([11]));
        await play.enter('g-1', hand([6]));
        await play.enter('g-1', hand([7]));
        await play.saveRound('g-1');
        expect(await play.undo()).toBe(true);
        const back = shown(play, 'g-1').saved;
        expect(back.rounds).toEqual(before.rounds);
        expect(back.draft).toEqual(before.draft);
    });

    it('is scored by the version of the rules the game was started under, saved or not', async () => {
        const { play } = await twoRounds();
        const rules = shown(play, 'g-1').saved.rules;
        await play.reopen('g-1', 0);
        expect(shown(play, 'g-1').draft?.preview.rules).toBe(rules);
        await play.enter('g-1', hand([11]));
        await play.saveRound('g-1');
        expect(shown(play, 'g-1').saved.rules).toBe(rules);
        expect(shown(play, 'g-1').result.rules).toBe(rules);
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

    it('keep a bid made before they were marked out, which still counts toward the bids', async () => {
        const { play } = await setUp();
        await play.start({ ...newGame('wizard'), options: { 'plus-minus-one': true } });
        await play.enterAll(
            'g-1',
            PLAYERS.map((player, at) => ({
                step: { part: 'bid', player } as const,
                value: [0, 1, 1][at],
            }))
        );
        await play.setOut('g-1', ['cat']);
        expect(shown(play, 'g-1').draft?.round.entries).toEqual({
            ann: { bid: 0 },
            ben: { bid: 1 },
            cat: { bid: 1 },
        });
        // Without Cat's bid, the bids would come to the one card dealt, which the option refuses.
        const tricks = [
            { step: { part: 'tricks', player: 'ann' } as const, value: 0 },
            { step: { part: 'tricks', player: 'ben' } as const, value: 1 },
        ];
        expect(await play.saveRound('g-1', undefined, tricks)).toEqual({
            saved: true,
            outcome: null,
        });
    });

    it('keep a bid in a saved round opened again, whose bids were all made', async () => {
        const { play } = await setUp();
        await play.start(newGame('wizard'));
        await play.enterAll(
            'g-1',
            PLAYERS.map((player, at) => ({
                step: { part: 'bid', player } as const,
                value: [1, 0, 1][at],
            }))
        );
        await play.saveRound(
            'g-1',
            undefined,
            PLAYERS.map((player, at) => ({
                step: { part: 'tricks', player } as const,
                value: [1, 0, 0][at],
            }))
        );
        await play.reopen('g-1', 0);
        await play.setOut('g-1', ['cat']);
        expect(shown(play, 'g-1').draft?.round.entries['cat']).toEqual({ bid: 1 });
    });

    it('keep a bid once every bid is in, as after going back to change the bids', async () => {
        const { play } = await setUp();
        await play.start(newGame('wizard'));
        await play.enterAll(
            'g-1',
            PLAYERS.map((player, at) => ({
                step: { part: 'bid', player } as const,
                value: [0, 1, 1][at],
            }))
        );
        await play.goTo('g-1', { part: 'bid', player: 'ann' });
        await play.setOut('g-1', ['cat']);
        expect(shown(play, 'g-1').draft?.round.entries['cat']).toEqual({ bid: 1 });
    });

    it('keep a bid when the round is saved with them marked out in the same change', async () => {
        const { play } = await setUp();
        await play.start({ ...newGame('wizard'), options: { 'plus-minus-one': true } });
        await play.enterAll(
            'g-1',
            PLAYERS.map((player, at) => ({
                step: { part: 'bid', player } as const,
                value: [0, 1, 1][at],
            }))
        );
        const tricks = [
            { step: { part: 'tricks', player: 'ann' } as const, value: 0 },
            { step: { part: 'tricks', player: 'ben' } as const, value: 1 },
        ];
        expect(await play.saveRound('g-1', ['cat'], tricks)).toEqual({
            saved: true,
            outcome: null,
        });
        expect(shown(play, 'g-1').saved.rounds[0]).toMatchObject({
            entries: { cat: { bid: 1 } },
            out: ['cat'],
        });
    });

    it('drop a bid still being set when they are marked out', async () => {
        const { play } = await setUp();
        await play.start(newGame('wizard'));
        await play.holdAll('g-1', [{ step: { part: 'bid', player: 'cat' }, value: 1 }]);
        await play.setOut('g-1', ['cat']);
        expect(shown(play, 'g-1').draft?.round.entries).toEqual({});
    });

    it('ask a player put back before who ended the round, which waits for every total', async () => {
        const { play } = await setUp();
        await play.start(newGame('skyjo'));
        await play.setOut('g-1', ['ann']);
        await play.enter('g-1', { total: 3 });
        await play.setOut('g-1', []);
        // Cat is asked next, then Ann, put back, and only then who ended the round.
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'cat' });
        await play.enter('g-1', { total: 9 });
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'ann' });
        await play.enter('g-1', { total: 5 });
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'ender', player: null });
    });

    it('move the round off who ended it to a player put back there, who has no total yet', async () => {
        const { play } = await setUp();
        await play.start(newGame('skyjo'));
        await play.enter('g-1', { total: 4 });
        await play.setOut('g-1', ['cat']);
        await play.enter('g-1', { total: 3 });
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'ender', player: null });
        await play.setOut('g-1', []);
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'cat' });
    });
});

describe('several values entered in one change', () => {
    const bids = (values: readonly number[]) =>
        PLAYERS.map((player, at) => ({
            step: { part: 'bid', player } as const,
            value: values[at],
        }));
    const tricks = (values: readonly number[]) =>
        PLAYERS.map((player, at) => ({
            step: { part: 'tricks', player } as const,
            value: values[at],
        }));

    it('enters every bid at once, moves to the first tricks, and undoes them together', async () => {
        const { play } = await setUp();
        await play.start(newGame('wizard'));
        await play.enterAll('g-1', bids([1, 0, 0]));
        const draft = shown(play, 'g-1').draft;
        expect(draft?.round.entries).toEqual({ ann: { bid: 1 }, ben: { bid: 0 }, cat: { bid: 0 } });
        expect(draft?.step).toEqual({ part: 'tricks', player: 'ann' });
        expect(await play.undo()).toBe(true);
        expect(shown(play, 'g-1').draft?.round.entries).toEqual({});
    });

    it('saves a round with every trick written in the same change, and undo takes back both', async () => {
        const { play } = await setUp();
        await play.start(newGame('wizard'));
        await play.enterAll('g-1', bids([1, 0, 0]));
        expect(await play.saveRound('g-1', undefined, tricks([1, 0, 0]))).toEqual({
            saved: true,
            outcome: null,
        });
        expect(shown(play, 'g-1').result.totals).toEqual({ ann: 30, ben: 20, cat: 20 });
        await play.undo();
        const draft = shown(play, 'g-1').draft;
        expect(shown(play, 'g-1').saved.rounds).toEqual([]);
        expect(draft?.round.entries).toEqual({ ann: { bid: 1 }, ben: { bid: 0 }, cat: { bid: 0 } });
    });

    it('keeps every bid as it is set without moving on, and leaves the last Undo in place', async () => {
        const { play } = await setUp();
        await play.start(newGame('wizard'));
        await play.holdAll('g-1', bids([1, 0, 0]));
        const draft = shown(play, 'g-1').draft;
        expect(draft?.round.entries).toEqual({ ann: { bid: 1 }, ben: { bid: 0 }, cat: { bid: 0 } });
        expect(draft?.step).toEqual({ part: 'bid', player: 'ann' });
        expect(play.snapshot().undo).toBeNull();
    });

    it('refuses to save tricks that do not add up to the cards dealt, and keeps the round', async () => {
        const { play } = await setUp();
        await play.start(newGame('wizard'));
        await play.enterAll('g-1', bids([1, 0, 0]));
        const saved = await play.saveRound('g-1', undefined, tricks([1, 1, 0]));
        expect(saved).toMatchObject({ saved: false, problems: [{ code: 'trick-total' }] });
        expect(shown(play, 'g-1').saved.rounds).toEqual([]);
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

describe('what each change keeps and refuses', () => {
    it('saves two taps made without waiting in the order they were made', async () => {
        const { factory, store } = await setUp();
        let release = () => {};
        let first = true;
        const slow: Store = {
            ...store,
            saveGame: async (game: SavedGame) => {
                if (
                    first &&
                    game.draft !== null &&
                    Object.keys(toDraftRound(game.draft.round).entries).length === 1
                ) {
                    first = false;
                    await new Promise<void>((resolve) => {
                        release = resolve;
                    });
                }
                await store.saveGame(game);
            },
        };
        const play = openPlay(slow, clock());
        await play.start(newGame('flip-7'));
        const one = play.enter('g-1', hand([4]));
        const two = play.enter('g-1', hand([5]));
        await Promise.resolve();
        await new Promise((resolve) => setTimeout(resolve, 0));
        release();
        await Promise.all([one, two]);
        expect(shown(play, 'g-1').draft?.round).toMatchObject({
            entries: { ann: hand([4]), ben: hand([5]) },
        });
        expect(shown(await reopenFrom(factory), 'g-1').draft?.round).toMatchObject({
            entries: { ann: hand([4]), ben: hand([5]) },
        });
    });

    it('walks a reopened round seat by seat, every entry already made, to nothing left after the last', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await flipRound(play, 'g-1', [hand([5]), hand([6]), hand([7])]);
        await play.reopen('g-1', 0);
        await play.enter('g-1', hand([11]));
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'ben' });
        await play.enter('g-1', hand([6]));
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'cat' });
        await play.enter('g-1', hand([7]));
        expect(shown(play, 'g-1').draft?.step).toBeNull();
    });

    it('goes on from a corrected step to the next seat, then back to the seat skipped', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await play.goTo('g-1', { part: 'entry', player: 'ben' });
        await play.enter('g-1', hand([2]));
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'cat' });
        await play.enter('g-1', hand([3]));
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'ann' });
    });

    it('refuses to move to a step the round does not have', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await expect(play.goTo('g-1', { part: 'ender', player: null })).rejects.toThrow(
            /no such step/
        );
    });

    it('drops the claim that a player ended the round once that player is out', async () => {
        const { play } = await setUp();
        await play.start(newGame('skyjo'));
        for (const total of [3, 4, 5]) await play.enter('g-1', { total });
        await play.enter('g-1', 'ann');
        await play.setOut('g-1', ['ann']);
        expect(shown(play, 'g-1').draft?.round).toMatchObject({ ender: null, out: ['ann'] });
        expect(shown(play, 'g-1').draft?.ready).toBe(false);
    });

    it('moves on from a player put out at the step they were on', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await play.setOut('g-1', ['ann']);
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'ben' });
    });

    it('stays at the step it was on when someone else is put out', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await play.goTo('g-1', { part: 'entry', player: 'cat' });
        await play.setOut('g-1', ['ann']);
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'cat' });
    });

    it('saves a round with the last player still to enter taken out in the same change, which undo puts back', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await play.enter('g-1', hand([4]));
        await play.enter('g-1', hand([5]));
        await play.hold('g-1', hand([9]));
        expect(await play.saveRound('g-1', ['cat'])).toMatchObject({ saved: true });
        expect(shown(play, 'g-1').saved.rounds).toEqual([
            { entries: { ann: hand([4]), ben: hand([5]) }, out: ['cat'] },
        ]);
        expect(shown(play, 'g-1').result.missed).toEqual(['cat']);
        expect(await play.undo()).toBe(true);
        expect(shown(play, 'g-1').saved.rounds).toEqual([]);
        expect(shown(play, 'g-1').draft).toMatchObject({
            round: { entries: { ann: hand([4]), ben: hand([5]), cat: hand([9]) }, out: [] },
            step: { part: 'entry', player: 'cat' },
        });
    });

    it('in a saved round opened again, passes the turn to the next seat from a player taken out, and asks a player put back at once', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await flipRound(play, 'g-1', [hand([3]), hand([4]), hand([5])]);
        await play.reopen('g-1', 0);
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'ann' });
        await play.setOut('g-1', ['ann']);
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'ben' });
        await play.enter('g-1', hand([4]));
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'cat' });
        await play.setOut('g-1', []);
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'ann' });
    });

    it('passes the turn from a player taken out to the next seat still to enter, not the first', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7', 'g-1', ['ann', 'ben', 'cat', 'dan']));
        await play.setOut('g-1', ['ann']);
        await play.enter('g-1', hand([4]));
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'cat' });
        await play.setOut('g-1', []);
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'cat' });
        await play.setOut('g-1', ['cat']);
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'dan' });
    });

    it('in a saved round opened again, keeps the turn on the seat before when the last seat is taken out', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await flipRound(play, 'g-1', [hand([3]), hand([4]), hand([5])]);
        await play.reopen('g-1', 0);
        await play.goTo('g-1', { part: 'entry', player: 'cat' });
        await play.setOut('g-1', ['cat']);
        expect(shown(play, 'g-1').draft?.step).toEqual({ part: 'entry', player: 'ben' });
        expect(shown(play, 'g-1').saved.rounds).toHaveLength(1);
        expect(shown(play, 'g-1').draft?.index).toBe(0);
    });

    it('refuses to save a round that is not whole, and keeps it as the draft', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await play.enter('g-1', hand([4]));
        expect(await play.saveRound('g-1')).toMatchObject({ saved: false });
        expect(shown(play, 'g-1').saved.rounds).toEqual([]);
        expect(shown(play, 'g-1').draft?.round).toMatchObject({ entries: { ann: hand([4]) } });
    });

    it('waits while a round being entered names a player out', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await flipRound(play, 'g-1', [hand([5]), hand([6]), hand([7])]);
        await play.setOut('g-1', ['ann']);
        await expect(play.reopen('g-1', 0)).rejects.toThrow(/round being entered/);
    });

    it('waits while a Skyjo round being entered names who ended it', async () => {
        const { play } = await setUp();
        await play.start(newGame('skyjo', 'g-1', ['ann', 'ben']));
        for (const entry of [{ total: 3 }, { total: 4 }, 'ann']) await play.enter('g-1', entry);
        await play.saveRound('g-1');
        await play.goTo('g-1', { part: 'ender', player: null });
        await play.enter('g-1', 'ben');
        await expect(play.reopen('g-1', 0)).rejects.toThrow(/round being entered/);
    });

    it('refuses to reopen a round that was never saved', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await expect(play.reopen('g-1', 0)).rejects.toThrow(/no saved round/);
    });

    it('puts back a reopened round that was let go', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await flipRound(play, 'g-1', [hand([5]), hand([6]), hand([7])]);
        await play.reopen('g-1', 0);
        await play.enter('g-1', hand([11]));
        const reopened = shown(play, 'g-1').saved;
        await play.dropDraft('g-1');
        expect(play.snapshot().undo).toEqual({ kind: 'draft', game: 'g-1' });
        await play.undo();
        expect(entered(shown(play, 'g-1').saved)).toEqual(entered(reopened));
    });

    it('puts back a player put out of the round', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await play.enter('g-1', hand([4]));
        const before = shown(play, 'g-1').saved;
        await play.setOut('g-1', ['ann']);
        expect(play.snapshot().undo).toEqual({ kind: 'out', game: 'g-1' });
        await play.undo();
        expect(entered(shown(play, 'g-1').saved)).toEqual(entered(before));
    });

    it('clears a refused save once undo saves what was there', async () => {
        const factory = new IDBFactory();
        const real = await openStore(factory, 'play');
        let refuse = false;
        const store: Store = {
            ...real,
            saveGame: async (game: SavedGame) => {
                if (refuse) throw new Error('full');
                await real.saveGame(game);
            },
        };
        const play = openPlay(store, clock());
        await play.start(newGame('flip-7'));
        refuse = true;
        await play.enter('g-1', hand([4]));
        refuse = false;
        await play.undo();
        expect(shown(play, 'g-1').error).toBeNull();
    });

    it('lists the game changed last first', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7', 'g-a'));
        await play.start(newGame('flip-7', 'g-b'));
        await play.enter('g-a', hand([1]));
        expect(play.snapshot().games.map(({ saved }) => saved.id)).toEqual(['g-a', 'g-b']);
    });

    it('refuses a second game under an id already in play', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await play.enter('g-1', hand([1]));
        await expect(play.start(newGame('wizard'))).rejects.toThrow(/already in progress/);
        expect(shown(play, 'g-1').saved.game).toBe('flip-7');
    });

    it('drops a game discarded in another tab when the page is shown again', async () => {
        const { factory, play } = await setUp();
        await play.start(newGame('flip-7'));
        const other = await reopenFrom(factory);
        await other.discard('g-1');
        await play.load();
        expect(play.snapshot().games).toEqual([]);
    });

    it('keeps a change the store refused when the games are read again', async () => {
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
        await play.load();
        expect(shown(play, 'g-1').draft?.round).toMatchObject({ entries: { ann: hand([4]) } });
        expect(shown(play, 'g-1').error).toBe('The phone is out of room.');
    });

    it('says a round was not saved when the store refuses it, and keeps it to save again', async () => {
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
        for (const entry of [hand([4]), hand([5])]) await play.enter('g-1', entry);
        refuse = true;
        await play.enter('g-1', hand([6]));
        expect(await play.saveRound('g-1')).toEqual({
            saved: false,
            problems: [],
            error: 'The phone is out of room.',
        });
        expect(shown(play, 'g-1').saved.rounds).toHaveLength(1);
        refuse = false;
        await play.retry('g-1');
        expect(shown(await reopenFrom(factory), 'g-1').saved.rounds).toHaveLength(1);
    });

    it('offers no undo once a change it does not take back comes after the one it would', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        for (const entry of [hand([4]), hand([5]), hand([6])]) await play.enter('g-1', entry);
        await play.saveRound('g-1');
        expect(play.snapshot().undo).toEqual({ kind: 'round', game: 'g-1' });
        await play.reopen('g-1', 0);
        expect(play.snapshot().undo).toBeNull();
        await play.dropDraft('g-1');
        await play.goTo('g-1', { part: 'entry', player: 'cat' });
        expect(play.snapshot().undo).toBeNull();
        await play.enter('g-1', hand([7]));
        await play.start(newGame('skyjo', 'g-2'));
        expect(play.snapshot().undo).toBeNull();
    });

    it('leaves a game changed since in another tab as it is, rather than undo over it', async () => {
        const { factory, play } = await setUp();
        await play.start(newGame('flip-7'));
        await play.enter('g-1', hand([4]));
        const other = await reopenFrom(factory);
        await other.enter('g-1', hand([5]));
        expect(await play.undo()).toBe(false);
        expect(play.snapshot().undo).toBeNull();
        expect(shown(await reopenFrom(factory), 'g-1').draft?.round).toMatchObject({
            entries: { ann: hand([4]), ben: hand([5]) },
        });
    });

    it('reopens another round over a reopened one left as it was saved', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7'));
        await flipRound(play, 'g-1', [hand([5]), hand([6]), hand([7])]);
        await flipRound(play, 'g-1', [hand([1]), hand([2]), hand([3])]);
        await play.reopen('g-1', 0);
        await play.reopen('g-1', 1);
        expect(shown(play, 'g-1').draft).toMatchObject({ index: 1 });
    });

    it('reports a reopened change that ends a finished game at an earlier round', async () => {
        const { play } = await setUp();
        await play.start(newGame('skyjo', 'g-1', ['ann', 'ben']));
        for (const total of [40, 40, 40]) {
            await play.enter('g-1', { total });
            await play.enter('g-1', { total: 0 });
            await play.enter('g-1', 'ben');
            await play.saveRound('g-1');
        }
        expect(shown(play, 'g-1').result.state).toBe('over');
        await play.reopen('g-1', 0);
        await play.enter('g-1', { total: 100 });
        expect(await play.saveRound('g-1')).toEqual({ saved: true, outcome: 'ended' });
    });

    it('saves a round as it was judged, with a list of players out read as ids', async () => {
        const { factory, store } = await setUp();
        const planted: SavedGame = {
            id: 'g-1',
            game: 'flip-7',
            rules: 1,
            options: {},
            players: PLAYERS,
            rounds: [],
            draft: {
                index: 0,
                round: { entries: { ann: hand([4]), ben: hand([5]), cat: hand([6]) }, out: [5] },
                step: null,
            },
            started: '2026-11-14T09:00:00Z',
            changed: '2026-11-14T09:00:00Z',
        };
        await store.saveGame(planted);
        const play = openPlay(store, clock());
        await play.load();
        expect(await play.saveRound('g-1')).toEqual({ saved: true, outcome: null });
        expect(await raw(factory, 'g-1')).toMatchObject({
            rounds: [{ out: [] }],
        });
        expect(shown(play, 'g-1').result.rounds[0]?.state).toBe('scored');
    });

    it('scores again only the game that changed', async () => {
        const { play } = await setUp();
        await play.start(newGame('flip-7', 'g-a'));
        await play.start(newGame('flip-7', 'g-b'));
        const before = shown(play, 'g-b');
        await play.enter('g-a', hand([1]));
        expect(shown(play, 'g-b')).toBe(before);
        expect(shown(play, 'g-a')).not.toBe(before);
    });

    it('imports nothing but the scoring package and its own modules', () => {
        for (const source of [playSource, stepsSource]) {
            const imports = [...source.matchAll(/^import[^;]*?(?:from )?'([^']+)';/gms)].map(
                (match) => match[1]
            );
            expect(imports.length).toBeGreaterThan(0);
            for (const name of imports)
                expect(name).toMatch(/^(@gametabletally\/scoring|\.\.?\/[^']+\.js)$/);
        }
    });
});

describe('asking the browser to keep the games', () => {
    it('asks each time a started game is saved, and not for a game the store refused', async () => {
        const factory = new IDBFactory();
        const store = await openStore(factory, 'play');
        const asked = vi.fn(() => Promise.resolve(true));
        const play = openPlay(store, clock(), asked);
        await play.start(newGame('flip-7'));
        expect(asked).toHaveBeenCalledOnce();

        const refusing: Store = {
            ...store,
            saveGame: () => Promise.reject(new Error('The phone is out of space.')),
        };
        const refused = vi.fn(() => Promise.resolve(true));
        await openPlay(refusing, clock(), refused).start(newGame('flip-7', 'g-2'));
        expect(refused).not.toHaveBeenCalled();
    });

    it('starts the game whatever the browser answers, a refusal to answer among them', async () => {
        const store = await openStore(new IDBFactory(), 'play');
        const play = openPlay(store, clock(), () => Promise.reject(new Error('blocked')));
        await play.start(newGame('flip-7'));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(shown(play, 'g-1').error).toBeNull();
    });
});
