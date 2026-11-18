import { type Problem, score, type ScoreResult } from '@gametabletally/scoring';

import {
    compareInstants,
    type SavedDraft,
    type SavedGame,
    type SavedStep,
    toScoreInput,
} from '../store/format.js';
import { keepStorage, type Store } from '../store/store.js';
import {
    type DraftRound,
    emptyRound,
    knowsGame,
    playingIn,
    read,
    sameStep,
    sameValue,
    stepsOf,
    toDraftRound,
    withOut,
    write,
} from './steps.js';

/**
 * Games in progress: the one place the round being entered, whose turn it is, undo and a reopened
 * round are worked out, for every game alike.
 *
 * It holds each game as the store saved it, its draft included, and saves it again after every
 * change. Scores are never held here: each game is handed to the scoring package as it stands and
 * the answer is read, problems included. Only saved rounds count toward a game's result, so a hand
 * half entered scores nothing and ends no game. The draft is scored apart, as a preview of the
 * round so far. A screen reads it through React's hook for an outside store, by `subscribe` and
 * `snapshot`, and a test drives it with no page.
 */

/** A game's draft as a screen shows it. */
export interface DraftInPlay extends SavedDraft {
    readonly round: DraftRound;
    /** The steps of the round, in order, for the players in it. */
    readonly steps: readonly SavedStep[];
    /** The players in the round, in seat order. */
    readonly playing: readonly string[];
    /**
     * The game scored with the draft in its place, for what the rules say of the round so far.
     * Its totals count nothing of a round that is not whole.
     */
    readonly preview: ScoreResult;
    /** Whether the round is whole by the rules, and so can be saved. */
    readonly ready: boolean;
}

/** A game as a screen shows it. */
export interface GameInPlay {
    /** The game as it is saved, or as it will be once a failed save goes through. */
    readonly saved: SavedGame;
    /** The scoring package's answer for the saved rounds. */
    readonly result: ScoreResult;
    readonly draft: DraftInPlay | null;
    /** Why the last change was not saved, or null when everything is. */
    readonly error: string | null;
}

/** The kind of change that can be taken back. */
export type UndoKind = 'entry' | 'out' | 'round' | 'draft' | 'discard';

export interface PlaySnapshot {
    /** Every game, the last changed first. */
    readonly games: readonly GameInPlay[];
    /** The last change and the game it was in, while it can be taken back, or null. */
    readonly undo: { readonly kind: UndoKind; readonly game: string } | null;
}

/** What saving a round came to. */
export type SavedRound =
    | {
          readonly saved: true;
          /**
           * `ended` when the round ended the game, or ended it at another round than before, and
           * `resumed` when it put a finished one back in play, and null when it did neither.
           */
          readonly outcome: 'ended' | 'resumed' | null;
      }
    | {
          readonly saved: false;
          /** What the rules refuse in the round, which keeps it from being whole. */
          readonly problems: readonly Problem[];
          /**
           * Why the store refused the save, or null when the round was not whole. A refused save
           * leaves the round saved in memory, to save again with `retry`.
           */
          readonly error: string | null;
      };

/** A new game, as a screen starts one. */
export interface NewGame {
    readonly id: string;
    readonly game: string;
    readonly rules: number;
    readonly options: Readonly<Record<string, unknown>>;
    readonly players: readonly string[];
}

export interface Play {
    readonly subscribe: (listener: () => void) => () => void;
    readonly snapshot: () => PlaySnapshot;
    /**
     * Reads every game from the store, as when the app opens or a page is shown again, so a change
     * made in another tab is read. A game whose last save failed keeps its change.
     */
    readonly load: () => Promise<void>;
    readonly start: (game: NewGame) => Promise<void>;
    /**
     * Enters the value of the step the round is at, and moves to the next step still empty, from
     * the start again after the last.
     */
    readonly enter: (id: string, value: unknown) => Promise<void>;
    /**
     * Keeps a value for the step the round is at without moving on, as a hand is tapped in a card
     * at a time, so a page loaded again in the middle of a hand comes back to it. It is taken back
     * by tapping again, so it offers no undo of its own, and leaves the last one in place.
     */
    readonly hold: (id: string, value: unknown) => Promise<void>;
    /** Moves the round to a step of its own, to correct an entry. */
    readonly goTo: (id: string, step: SavedStep) => Promise<void>;
    /**
     * Names the players out of the round, who are then passed over, with what they had entered
     * taken out.
     */
    readonly setOut: (id: string, out: readonly string[]) => Promise<void>;
    readonly saveRound: (id: string) => Promise<SavedRound>;
    /**
     * Makes a draft of a saved round. The round stays as it was until the draft is saved. It is
     * refused while the round being entered holds anything of its own.
     */
    readonly reopen: (id: string, index: number) => Promise<void>;
    /**
     * Lets the draft go: a reopened round stays as it was saved, and the game goes on with an
     * empty next round, or none once it is over.
     */
    readonly dropDraft: (id: string) => Promise<void>;
    /** Removes a game, which undo puts back. */
    readonly discard: (id: string) => Promise<void>;
    /**
     * Puts back what was there before the last change, and resolves to whether it did. It does
     * not when the game has changed since, in another tab.
     */
    readonly undo: () => Promise<boolean>;
    /** Forgets the last change, as its toast goes. */
    readonly dismissUndo: () => void;
    /** Saves a game again whose last save failed. */
    readonly retry: (id: string) => Promise<void>;
    /**
     * Resolves once every change asked for so far is saved or refused, so a screen that is left
     * lets its database go only after the last tap is written.
     */
    readonly settled: () => Promise<void>;
}

/** The game scored as it is saved. */
const scored = (game: SavedGame): ScoreResult => score(toScoreInput(game));

/** The saved rounds with a round in a place, replacing a saved one or after the last. */
const withRound = (rounds: readonly unknown[], index: number, round: unknown): unknown[] =>
    index < rounds.length
        ? rounds.map((saved, at) => (at === index ? round : saved))
        : [...rounds, round];

/**
 * The first step of a round still to be entered, from the place given on and then from the start,
 * or null when all are.
 */
const nextStep = (steps: readonly SavedStep[], round: DraftRound, from: number): SavedStep | null =>
    steps.slice(from).find((step) => read(round, step) === undefined) ??
    steps.find((step) => read(round, step) === undefined) ??
    null;

/**
 * The step a round moves to once the value given is entered for the step it is at, or null when
 * none is left, as `enter` moves it. A screen names what comes next by it.
 */
export const stepAfter = (game: GameInPlay, value: unknown): SavedStep | null => {
    const draft = game.draft;
    const step = draft?.step ?? null;
    if (draft === null || step === null) return null;
    const round = write(draft.round, step, value);
    const steps = stepsOf(game.saved.game, game.saved.players, round);
    const at = steps.findIndex((one) => sameStep(one, step));
    return nextStep(steps, round, at + 1);
};

/** A draft of a new round at a place, at its first step. */
const newDraft = (game: SavedGame, index: number): SavedDraft => {
    const round = emptyRound();
    return { index, round, step: stepsOf(game.game, game.players, round)[0] ?? null };
};

/**
 * The draft a game goes on with after a round is saved or let go: the next round, or none once it
 * is over.
 */
const followingDraft = (game: SavedGame): SavedDraft | null =>
    scored(game).state === 'over' ? null : newDraft(game, game.rounds.length);

/**
 * Whether a draft holds anything of its own: for a new round anything entered, and for a reopened
 * one anything that differs from the round as it was saved.
 */
const touched = (game: SavedGame): boolean => {
    if (game.draft === null) return false;
    const { index, round } = game.draft;
    const origin = index < game.rounds.length ? toDraftRound(game.rounds[index]) : emptyRound();
    return !sameValue(toDraftRound(round), origin);
};

/** How many rounds a finished game was scored to, which says at which round it ended. */
const scoredTo = (result: ScoreResult): number =>
    result.rounds.filter(({ state }) => state === 'scored').length;

const view = (game: SavedGame, error: string | null): GameInPlay => {
    const result = scored(game);
    if (game.draft === null) return { saved: game, result, draft: null, error };
    const { index } = game.draft;
    const round = toDraftRound(game.draft.round);
    const preview = score({ ...toScoreInput(game), rounds: withRound(game.rounds, index, round) });
    // The scoring package scores a round only once it is whole and nothing in it is refused.
    const ready = preview.rounds[index]?.state === 'scored';
    return {
        saved: game,
        result,
        draft: {
            ...game.draft,
            round,
            steps: stepsOf(game.game, game.players, round),
            playing: playingIn(game.players, round),
            preview,
            ready,
        },
        error,
    };
};

const lastChangedFirst = (first: GameInPlay, second: GameInPlay): number =>
    compareInstants(second.saved.changed, first.saved.changed);

/** What a store's refusal says, as a sentence. */
const reason = (error: unknown): string =>
    error instanceof Error ? error.message : 'The change was not saved.';

/** The last change, with what was there before it and when the game was saved after it. */
interface Last {
    readonly kind: UndoKind;
    readonly game: string;
    readonly before: SavedGame;
    /** When the change was saved, or null for a discard, which leaves nothing saved. */
    readonly after: string | null;
}

/**
 * Opens the games in progress over a store. `now` gives the time each change is saved at, as an
 * ISO 8601 date and time in UTC, and a test passes its own. `askToKeep` asks the browser to keep
 * what is saved each time a started game is saved, since from then the phone holds something worth
 * keeping. A browser that has agreed already is not asked again.
 */
export const openPlay = (
    store: Store,
    now: () => string = () => new Date().toISOString(),
    askToKeep: () => Promise<unknown> = () => keepStorage()
): Play => {
    const games = new Map<string, SavedGame>();
    const errors = new Map<string, string>();
    let last: Last | null = null;
    const listeners = new Set<() => void>();
    let current: PlaySnapshot = { games: [], undo: null };
    // Each game is scored again only when its record or its error changes, however many are kept.
    const views = new WeakMap<SavedGame, GameInPlay>();
    // Each change waits for the one before it, so two taps never save over each other.
    let queue: Promise<unknown> = Promise.resolve();

    const viewOf = (game: SavedGame): GameInPlay => {
        const error = errors.get(game.id) ?? null;
        const cached = views.get(game);
        if (cached?.error === error) return cached;
        const fresh = view(game, error);
        views.set(game, fresh);
        return fresh;
    };

    const publish = () => {
        current = {
            games: [...games.values()].map(viewOf).sort(lastChangedFirst),
            undo: last === null ? null : { kind: last.kind, game: last.game },
        };
        for (const listener of listeners) listener();
    };

    const inOrder = <Result>(work: () => Promise<Result>): Promise<Result> => {
        const run = queue.then(work, work);
        queue = run.catch(() => undefined);
        return run;
    };

    const gameOf = (id: string): SavedGame => {
        const game = games.get(id);
        if (!game) throw new Error('There is no game in progress with this id.');
        return game;
    };

    const draftOf = (game: SavedGame): SavedDraft => {
        if (game.draft === null) throw new Error('The game has no round being entered.');
        return game.draft;
    };

    /** Saves a game as it stands, and resolves to why the store refused it, or null. */
    const save = async (game: SavedGame): Promise<string | null> => {
        try {
            await store.saveGame(game);
            errors.delete(game.id);
            return null;
        } catch (error) {
            const why = reason(error);
            errors.set(game.id, why);
            return why;
        }
    };

    /**
     * Keeps a game as changed and saves it, and resolves to why the store refused it, or null. A
     * refused save leaves the change in place, with the reason beside it, so the entry is still
     * there to save again. The change becomes the one undo takes back, or, where it is not one to
     * take back, leaves none, so undo never goes back further than one step.
     */
    const keep = async (
        game: SavedGame,
        undo: { readonly kind: UndoKind; readonly before: SavedGame } | null | 'carry'
    ): Promise<string | null> => {
        const changed = { ...game, changed: now() };
        games.set(changed.id, changed);
        const why = await save(changed);
        // A change offered no undo of its own leaves the last one in place, still able to take
        // the game back past it, since the store now holds this change.
        if (undo === 'carry') {
            if (last !== null && last.game === changed.id && why === null)
                last = { ...last, after: changed.changed };
            publish();
            return why;
        }
        // Undo expects the store to hold the copy this change left there: the change itself, or,
        // where its save was refused, the copy from before it.
        last =
            undo === null
                ? null
                : {
                      ...undo,
                      game: changed.id,
                      after: why === null ? changed.changed : undo.before.changed,
                  };
        publish();
        return why;
    };

    return {
        subscribe: (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        snapshot: () => current,
        load: () =>
            inOrder(async () => {
                const saved = await store.games();
                const unsaved = new Map(
                    [...errors.keys()].flatMap((id) => {
                        const game = games.get(id);
                        return game ? [[id, game] as const] : [];
                    })
                );
                games.clear();
                for (const game of saved) games.set(game.id, game);
                // A change the store refused is kept over the copy it never replaced.
                for (const [id, game] of unsaved) games.set(id, game);
                for (const id of errors.keys()) if (!games.has(id)) errors.delete(id);
                publish();
            }),
        start: (game) =>
            inOrder(async () => {
                if (!knowsGame(game.game))
                    throw new Error('The app cannot enter a round of this game.');
                if (games.has(game.id))
                    throw new Error('A game with this id is already in progress.');
                const at = now();
                const fresh: SavedGame = {
                    ...game,
                    rounds: [],
                    draft: null,
                    started: at,
                    changed: at,
                };
                const refused = await keep({ ...fresh, draft: newDraft(fresh, 0) }, null);
                // The answer is not waited for, since a browser may ask the visitor first.
                if (refused === null) void askToKeep().catch(() => undefined);
            }),
        enter: (id, value) =>
            inOrder(async () => {
                const game = gameOf(id);
                const draft = draftOf(game);
                if (draft.step === null) throw new Error('Every step of the round is entered.');
                const round = write(toDraftRound(draft.round), draft.step, value);
                const steps = stepsOf(game.game, game.players, round);
                const at = steps.findIndex((step) => sameStep(step, draft.step));
                const step = nextStep(steps, round, at + 1);
                await keep(
                    { ...game, draft: { ...draft, round, step } },
                    { kind: 'entry', before: game }
                );
            }),
        hold: (id, value) =>
            inOrder(async () => {
                const game = gameOf(id);
                const draft = draftOf(game);
                if (draft.step === null) throw new Error('Every step of the round is entered.');
                const round = write(toDraftRound(draft.round), draft.step, value);
                await keep({ ...game, draft: { ...draft, round } }, 'carry');
            }),
        goTo: (id, step) =>
            inOrder(async () => {
                const game = gameOf(id);
                const draft = draftOf(game);
                const steps = stepsOf(game.game, game.players, toDraftRound(draft.round));
                if (!steps.some((one) => sameStep(one, step)))
                    throw new Error('The round has no such step.');
                await keep({ ...game, draft: { ...draft, step } }, null);
            }),
        setOut: (id, out) =>
            inOrder(async () => {
                const game = gameOf(id);
                const draft = draftOf(game);
                const round = withOut(toDraftRound(draft.round), game.players, out);
                const steps = stepsOf(game.game, game.players, round);
                const still = steps.some((step) => sameStep(step, draft.step));
                const step = still ? draft.step : nextStep(steps, round, 0);
                await keep(
                    { ...game, draft: { ...draft, round, step } },
                    { kind: 'out', before: game }
                );
            }),
        saveRound: (id) =>
            inOrder(async (): Promise<SavedRound> => {
                const game = gameOf(id);
                const draft = viewOf(game).draft;
                if (draft === null) throw new Error('The game has no round being entered.');
                if (!draft.ready)
                    return {
                        saved: false,
                        problems: draft.preview.problems.filter(
                            (problem) => problem.round === draft.index
                        ),
                        error: null,
                    };
                const before = scored(game);
                // The round is saved as it was judged, so what is saved scores as it was previewed.
                const rounds = withRound(game.rounds, draft.index, draft.round);
                const next = { ...game, rounds, draft: null };
                const after = scored(next);
                const why = await keep(
                    { ...next, draft: followingDraft(next) },
                    {
                        kind: 'round',
                        before: game,
                    }
                );
                if (why !== null) return { saved: false, problems: [], error: why };
                const ended =
                    after.state === 'over' &&
                    (before.state !== 'over' || scoredTo(before) !== scoredTo(after));
                const resumed = before.state === 'over' && after.state !== 'over';
                return { saved: true, outcome: ended ? 'ended' : resumed ? 'resumed' : null };
            }),
        reopen: (id, index) =>
            inOrder(async () => {
                const game = gameOf(id);
                if (!Number.isSafeInteger(index) || index < 0 || index >= game.rounds.length)
                    throw new Error('The game has no saved round at this place.');
                if (touched(game))
                    throw new Error('Save or let go of the round being entered first.');
                const round = toDraftRound(game.rounds[index]);
                const step = stepsOf(game.game, game.players, round)[0] ?? null;
                await keep({ ...game, draft: { index, round, step } }, null);
            }),
        dropDraft: (id) =>
            inOrder(async () => {
                const game = gameOf(id);
                draftOf(game);
                await keep(
                    { ...game, draft: followingDraft(game) },
                    { kind: 'draft', before: game }
                );
            }),
        discard: (id) =>
            inOrder(async () => {
                const game = gameOf(id);
                await store.removeGame(id);
                games.delete(id);
                errors.delete(id);
                last = { kind: 'discard', game: id, before: game, after: null };
                publish();
            }),
        undo: () =>
            inOrder(async () => {
                if (last === null) return false;
                const { before, after } = last;
                last = null;
                // A game changed since, in another tab, is left as it is rather than lost.
                const stored = await store.game(before.id);
                if ((stored?.changed ?? null) !== after) {
                    publish();
                    return false;
                }
                // Saved at the time it is put back, so a backup taken before the undo, holding
                // the change, does not win a later merge over it.
                const back = { ...before, changed: now() };
                games.set(back.id, back);
                await save(back);
                publish();
                return true;
            }),
        dismissUndo: () => {
            if (last === null) return;
            last = null;
            publish();
        },
        retry: (id) =>
            inOrder(async () => {
                const game = gameOf(id);
                await save(game);
                publish();
            }),
        settled: () => queue.then(() => undefined),
    };
};
