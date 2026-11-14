import { type Problem, score, type ScoreResult } from '@gametabletally/scoring';

import { type SavedDraft, type SavedGame, type SavedStep, toScoreInput } from '../store/format.js';
import type { Store } from '../store/store.js';
import {
    emptyRound,
    knowsGame,
    playingIn,
    read,
    sameStep,
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
 * the answer is read, problems included. Only saved rounds are scored, so a hand half entered
 * scores nothing and ends no game. A screen reads it through React's hook for an outside store,
 * by `subscribe` and `snapshot`, and a test drives it with no page.
 */

/** A game's draft as a screen shows it. */
export interface DraftInPlay extends SavedDraft {
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

/** What can be taken back, and which game it is in. */
export type UndoKind = 'entry' | 'out' | 'round' | 'draft' | 'discard';

export interface PlaySnapshot {
    /** Every game, the last changed first. */
    readonly games: readonly GameInPlay[];
    /** What the last change was, while it can be taken back, or null. */
    readonly undo: { readonly kind: UndoKind; readonly game: string } | null;
}

/** What saving a round came to. */
export type SavedRound =
    | {
          readonly saved: true;
          /** `ended` when the round ended the game, `resumed` when it put a finished one back in play. */
          readonly outcome: 'ended' | 'resumed' | null;
      }
    | { readonly saved: false; readonly problems: readonly Problem[] };

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
    /** Reads every game from the store, as when the app opens or a page is shown again. */
    readonly load: () => Promise<void>;
    readonly start: (game: NewGame) => Promise<void>;
    /** Enters the value of the step the round is at, and moves to the next. */
    readonly enter: (id: string, value: unknown) => Promise<void>;
    /** Moves the round to a step of its own, to correct an entry. */
    readonly goTo: (id: string, step: SavedStep) => Promise<void>;
    /** Names the players out of the round, who are then passed over. */
    readonly setOut: (id: string, out: readonly string[]) => Promise<void>;
    readonly saveRound: (id: string) => Promise<SavedRound>;
    /** Makes a draft of a saved round. The round stays as it was until the draft is saved. */
    readonly reopen: (id: string, index: number) => Promise<void>;
    /** Lets the draft go: a reopened round stays as it was saved, and a new one starts empty. */
    readonly dropDraft: (id: string) => Promise<void>;
    /** Removes a game, which undo puts back. */
    readonly discard: (id: string) => Promise<void>;
    /** Puts back exactly what was there before the last change. */
    readonly undo: () => Promise<void>;
    /** Forgets the last change, as its toast goes. */
    readonly dismissUndo: () => void;
    /** Saves a game again whose last save failed. */
    readonly retry: (id: string) => Promise<void>;
}

/** The game scored as it is saved. */
const scored = (game: SavedGame): ScoreResult => score(toScoreInput(game));

/** The saved rounds with a round in a place, replacing a saved one or after the last. */
const withRound = (rounds: readonly unknown[], index: number, round: unknown): unknown[] =>
    index < rounds.length
        ? rounds.map((saved, at) => (at === index ? round : saved))
        : [...rounds, round];

/** The first step of a round still to be entered, from the one given on, or null when all are. */
const nextStep = (
    steps: readonly SavedStep[],
    round: ReturnType<typeof toDraftRound>,
    from: number
): SavedStep | null =>
    steps.slice(from).find((step) => read(round, step) === undefined) ??
    steps.find((step) => read(round, step) === undefined) ??
    null;

/** A draft of a new round at a place, at its first step. */
const newDraft = (game: SavedGame, index: number): SavedDraft => {
    const round = emptyRound();
    return { index, round, step: stepsOf(game.game, game.players, round)[0] ?? null };
};

/** The draft a game goes on with after a round is saved or let go: the next round, or none once it is over. */
const followingDraft = (game: SavedGame): SavedDraft | null =>
    scored(game).state === 'over' ? null : newDraft(game, game.rounds.length);

/** Whether a draft holds anything entered. */
const touched = (draft: SavedDraft | null): boolean => {
    if (draft === null) return false;
    const round = toDraftRound(draft.round);
    return (
        Object.keys(round.entries).length > 0 ||
        round.out.length > 0 ||
        (round['ender'] ?? null) !== null
    );
};

const inPlay = (game: SavedGame, error: string | null): GameInPlay => {
    const result = scored(game);
    if (game.draft === null) return { saved: game, result, draft: null, error };
    const round = toDraftRound(game.draft.round);
    const preview = score({
        ...toScoreInput(game),
        rounds: withRound(game.rounds, game.draft.index, round),
    });
    const ready =
        preview.rounds[game.draft.index]?.state === 'scored' &&
        !preview.problems.some((problem) => problem.round === game.draft?.index);
    return {
        saved: game,
        result,
        draft: {
            ...game.draft,
            steps: stepsOf(game.game, game.players, round),
            playing: playingIn(game.players, round),
            preview,
            ready,
        },
        error,
    };
};

const lastChangedFirst = (first: GameInPlay, second: GameInPlay): number =>
    Date.parse(second.saved.changed) - Date.parse(first.saved.changed);

/** What a store's refusal says, as a sentence. */
const reason = (error: unknown): string =>
    error instanceof Error ? error.message : 'The change was not saved.';

/**
 * Opens the games in progress over a store. `now` gives the time each change is saved at, as an
 * ISO 8601 date and time in UTC, and a test passes its own.
 */
export const openPlay = (
    store: Store,
    now: () => string = () => new Date().toISOString()
): Play => {
    const games = new Map<string, SavedGame>();
    const errors = new Map<string, string>();
    let last: { kind: UndoKind; game: string; before: SavedGame } | null = null;
    const listeners = new Set<() => void>();
    let current: PlaySnapshot = { games: [], undo: null };
    // Each change waits for the one before it, so two taps never save over each other.
    let queue: Promise<unknown> = Promise.resolve();

    const publish = () => {
        current = {
            games: [...games.values()]
                .map((game) => inPlay(game, errors.get(game.id) ?? null))
                .sort(lastChangedFirst),
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

    /**
     * Keeps a game as changed and saves it. A save the store refuses leaves the change in place,
     * with the reason beside it, so the entry is still there to save again.
     */
    const keep = async (game: SavedGame, undo: UndoKind | null, before?: SavedGame) => {
        const changed = { ...game, changed: now() };
        games.set(changed.id, changed);
        if (undo !== null && before) last = { kind: undo, game: changed.id, before };
        try {
            await store.saveGame(changed);
            errors.delete(changed.id);
        } catch (error) {
            errors.set(changed.id, reason(error));
        }
        publish();
    };

    /** The game with its draft changed, the round written and the step moved on as given. */
    const withDraft = (game: SavedGame, draft: SavedDraft): SavedGame => ({ ...game, draft });

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
                games.clear();
                for (const game of saved) games.set(game.id, game);
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
                await keep({ ...fresh, draft: newDraft(fresh, 0) }, null);
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
                await keep(withDraft(game, { ...draft, round, step }), 'entry', game);
            }),
        goTo: (id, step) =>
            inOrder(async () => {
                const game = gameOf(id);
                const draft = draftOf(game);
                const steps = stepsOf(game.game, game.players, toDraftRound(draft.round));
                if (!steps.some((one) => sameStep(one, step)))
                    throw new Error('The round has no such step.');
                await keep(withDraft(game, { ...draft, step }), null);
            }),
        setOut: (id, out) =>
            inOrder(async () => {
                const game = gameOf(id);
                const draft = draftOf(game);
                const round = withOut(toDraftRound(draft.round), game.players, out);
                const steps = stepsOf(game.game, game.players, round);
                const still = steps.some((step) => sameStep(step, draft.step));
                const step = still ? draft.step : nextStep(steps, round, 0);
                await keep(withDraft(game, { ...draft, round, step }), 'out', game);
            }),
        saveRound: (id) =>
            inOrder(async () => {
                const game = gameOf(id);
                const draft = draftOf(game);
                const view = inPlay(game, null).draft;
                if (!view?.ready)
                    return {
                        saved: false,
                        problems: (view?.preview.problems ?? []).filter(
                            (problem) => problem.round === draft.index
                        ),
                    } as const;
                const before = scored(game).state;
                const rounds = withRound(game.rounds, draft.index, draft.round);
                const next = { ...game, rounds, draft: null };
                const after = scored(next).state;
                await keep({ ...next, draft: followingDraft(next) }, 'round', game);
                const outcome = before === after ? null : after === 'over' ? 'ended' : 'resumed';
                return { saved: true, outcome } as const;
            }),
        reopen: (id, index) =>
            inOrder(async () => {
                const game = gameOf(id);
                if (!Number.isSafeInteger(index) || index < 0 || index >= game.rounds.length)
                    throw new Error('The game has no saved round at this place.');
                if (touched(game.draft))
                    throw new Error('Save or let go of the round being entered first.');
                const round = toDraftRound(game.rounds[index]);
                const step = stepsOf(game.game, game.players, round)[0] ?? null;
                await keep(withDraft(game, { index, round, step }), null);
            }),
        dropDraft: (id) =>
            inOrder(async () => {
                const game = gameOf(id);
                draftOf(game);
                await keep({ ...game, draft: followingDraft(game) }, 'draft', game);
            }),
        discard: (id) =>
            inOrder(async () => {
                const game = gameOf(id);
                await store.removeGame(id);
                games.delete(id);
                errors.delete(id);
                last = { kind: 'discard', game: id, before: game };
                publish();
            }),
        undo: () =>
            inOrder(async () => {
                if (last === null) return;
                const { before } = last;
                last = null;
                games.set(before.id, before);
                try {
                    await store.saveGame(before);
                    errors.delete(before.id);
                } catch (error) {
                    errors.set(before.id, reason(error));
                }
                publish();
            }),
        dismissUndo: () => {
            if (last === null) return;
            last = null;
            publish();
        },
        retry: (id) =>
            inOrder(async () => {
                await keep(gameOf(id), null);
            }),
    };
};
