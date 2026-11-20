import type { Problem } from '@gametabletally/scoring';
import { Button, useBusy, useFocusAfterDraw, useStatus } from '@jasonsdevspace/design-kit/react';
import { useState } from 'react';

import { Link, navigate, usePlace } from '../navigation.js';
import { type GameInPlay, type Play, stepAfter, type StepValue } from '../play/play.js';
import { type DraftRound, playingIn, read, stepsOf, toDraftRound, withOut } from '../play/steps.js';
import { atRound, changedFrom, hrefOf } from '../routes.js';
import type { SavedStep } from '../store/format.js';
import { listOf } from '../website/games.js';
import { Dock } from './AppFrame.js';
import { nameIn } from './opened-game.js';
import { entrySummary, type RoundLine, roundSummary } from './round-summary.js';
import { spokenOf } from './ScoreHeader.js';
import type { Summary } from './summary.js';

/*
 * What a round being entered does the same for every game: moving the turn on, saving the round,
 * letting a changed round go, and skipping a player and putting them back, each with what the
 * frame's toast and the status line say of it, and the dock and the rows under the header that
 * hold them. A game draws its own keys and gives its own words for each player's part of a round.
 */

/** A game whose round is being entered. */
export type GameWithDraft = GameInPlay & { readonly draft: NonNullable<GameInPlay['draft']> };

/**
 * A player's total over the scored rounds before the one being entered, so a reopened round is
 * never counted twice, once as saved and again as it stands.
 */
export const totalBefore = (game: GameInPlay, player: string, index: number): number =>
    game.result.rounds
        .slice(0, index)
        .reduce(
            (total, round) =>
                round.state === 'scored' ? total + (round.scores[player] ?? 0) : total,
            0
        );

/** A game as the model holds it now, read once a change is kept. */
export const keptOf = (play: Play, id: string): GameInPlay | undefined =>
    play.snapshot().games.find(({ saved }) => saved.id === id);

/**
 * Whether a round's draft is a saved round opened again to change it, which the model walks step
 * by step, as it counts the saved rounds.
 */
export const isChanging = (game: GameInPlay, draft: NonNullable<GameInPlay['draft']>): boolean =>
    draft.index < game.saved.rounds.length;

/** Whether a round can spare one more player, since it needs two in it, as the rules hold. */
export const canSkip = (players: readonly string[], round: DraftRound): boolean =>
    playingIn(players, round).length > 2;

/** Who is out of a round, in a sentence. */
export const outWords = (names: readonly string[]): string =>
    `${listOf(names, 'and')} ${names.length === 1 ? 'is' : 'are'} out of this round.`;

/** Why no one else can sit a round out, after who already is, in a sentence. */
export const floorWords = (names: readonly string[]): string =>
    names.length === 0
        ? 'A round needs two players, so no one else can sit this one out.'
        : `${listOf(names, 'and')} ${names.length === 1 ? 'is' : 'are'} out, and a round needs two players.`;

/**
 * Who a player put back into a round comes after, as the turn runs on from the player whose turn
 * it is, and whether that is the player entering now, or null where the turn reaches them first.
 */
export const comesAfter = (
    {
        game,
        players,
        round,
    }: { readonly game: string; readonly players: readonly string[]; readonly round: DraftRound },
    current: string,
    back: string
): { readonly player: string; readonly now: boolean } | null => {
    const steps = stepsOf(game, players, round);
    const at = steps.findIndex((step) => step.player === current);
    if (at < 0) return null;
    const order = [...steps.slice(at), ...steps.slice(0, at)].filter(
        (step, place) => place === 0 || read(round, step) === undefined
    );
    const where = order.findIndex((step) => step.player === back);
    const before = order[where - 1];
    // At 0 the player is the one entering, and at -1 they are not in the round.
    return where < 1 || before === undefined || before.player === null
        ? null
        : { player: before.player, now: where === 1 };
};

/** What a skip says: the player out of the round, with no score for it, and their total kept. */
export const skipWords = (name: string, index: number, before: number): string =>
    `${name} is out of round ${String(index + 1)}, with no score for it. ${name}'s total stays at ${spokenOf(before)}.`;

/**
 * The way to skip the player whose turn it is, under the header and so the whole hand away from
 * the button for the next player, then who is out of the round with a way to put each back, or,
 * where a skip would leave one player in the round, why no one else can sit it out.
 */
export const SkipRows = ({
    name,
    out,
    skippable,
    last,
    off,
    onSkip,
    onBack,
}: {
    readonly name: string;
    readonly out: readonly { readonly player: string; readonly name: string }[];
    readonly skippable: boolean;
    /** Whether the player is the last still to enter, so a skip saves the round. */
    readonly last: boolean;
    readonly off: boolean;
    readonly onSkip: () => void;
    readonly onBack: (player: string) => void;
}) => {
    const backs = out.map((one) => (
        <Button
            key={one.player}
            text
            id={`put-back-${one.player}`}
            off={off}
            onClick={() => {
                onBack(one.player);
            }}
        >
            Put {one.name} back
        </Button>
    ));
    const names = out.map((one) => one.name);
    // Where no one else can be skipped, who is out and why share one line, so the keys keep their
    // place above the dock on a phone.
    if (!skippable)
        return (
            <p className="dk-actions dk-note">
                <span>{floorWords(names)}</span>
                {backs}
            </p>
        );
    return (
        <>
            <p className="dk-actions">
                <Button text id="skip-player" off={off} onClick={onSkip}>
                    {last ? `Skip ${name} and finish the round` : `Skip ${name} this round`}
                </Button>
            </p>
            {out.length === 0 ? null : (
                <p className="dk-actions dk-note">
                    <span>{outWords(names)}</span>
                    {backs}
                </p>
            )}
        </>
    );
};

/** Where focus goes after a put back: the way to put back the next player still out, or the skip. */
const focusAfterBack = (rest: readonly string[]): string => {
    const [stillOut] = rest;
    return stillOut === undefined ? 'skip-player' : `put-back-${stillOut}`;
};

/**
 * What the button that moves a round on says while its press runs, from its label: the save it
 * makes, or the entry it keeps on the way to the next player, and nothing for a move that saves
 * nothing, such as from the hand to the tricks.
 */
export const busyWordsOf = (label: string): string => {
    if (label.startsWith('Save ')) return `Saving ${label.slice('Save '.length)}.`;
    if (label.startsWith('Next: ')) return 'Keeping the entry.';
    return '';
};

/**
 * A round's dock: the button that moves the round on, last, nearest the thumb, and beside it the
 * way to the scores, or, for a saved round opened again, the way to let the change go. The button
 * that moves the round on is the kit's busy button while what it started runs, so a second press
 * is let go.
 */
export const RoundDock = ({
    id,
    index,
    changing,
    off,
    moving = false,
    refused,
    why = 'hand-why',
    described,
    label,
    onNext,
    onCancel,
}: {
    readonly id: string;
    readonly index: number;
    readonly changing: boolean;
    /** Whether a change to the round is under way, which turns the dock's buttons off. */
    readonly off: boolean;
    /** Whether that change is the press of the button that moves the round on, which it says. */
    readonly moving?: boolean;
    /** Whether the round cannot move on, which the element named by `why` says why. */
    readonly refused: boolean;
    /** The id of what says why the round cannot move on. */
    readonly why?: string;
    /** The id of what says what moving on will do, while it can. */
    readonly described?: string | undefined;
    readonly label: string;
    readonly onNext: () => void;
    readonly onCancel: () => void;
}) => {
    const next = useBusy<HTMLButtonElement>();
    const busyWords = busyWordsOf(label);
    return (
        <Dock>
            <div className="dk-app-dock-inline">
                {changing ? (
                    <Button tall off={off} onClick={onCancel}>
                        Cancel
                        <span className="dk-visually-hidden"> the change to round {index + 1}</span>
                    </Button>
                ) : (
                    <Link className="dk-button dk-button-tall" href={hrefOf('scores', id)}>
                        Scores
                    </Link>
                )}
                <Button
                    ref={next}
                    accent
                    tall
                    off={refused || (off && !(moving && busyWords !== ''))}
                    busy={moving && busyWords !== '' ? busyWords : false}
                    aria-describedby={refused ? why : described}
                    onClick={onNext}
                >
                    {label}
                </Button>
            </div>
        </Dock>
    );
};

/**
 * The label of the button that moves a round on: the next player, the question of who ended it,
 * or the save, of the round being entered or of a saved round opened again.
 */
export const nextLabel = (
    following: SavedStep | null,
    names: ReadonlyMap<string, string>,
    index: number,
    changing: boolean
): string => {
    if (following?.part === 'ender') return 'Next: who ended the round';
    const player = following?.player ?? null;
    if (player !== null) return `Next: ${nameIn(names, player)}`;
    return changing ? `Save round ${String(index + 1)}` : 'Save the round';
};

/**
 * What every game's round does, for the player whose turn it is, or for no one at a step that
 * belongs to the round, such as who ended it. `lineOf` gives a player's part of the round in the
 * toast's words, from the round as it is kept and the score the rules gave them.
 */
export const useRound = ({
    play,
    game,
    names,
    summary,
    lineOf,
}: {
    readonly play: Play;
    readonly game: GameWithDraft;
    readonly names: ReadonlyMap<string, string>;
    readonly summary: Summary;
    readonly lineOf: (
        player: string,
        round: DraftRound,
        score: number | undefined,
        out: boolean
    ) => RoundLine;
}) => {
    const { draft } = game;
    const id = game.saved.id;
    const nameOf = (one: string) => nameIn(names, one);
    const [busy, setBusy] = useState(false);
    // Whether what is under way is the press of the button that moves the round on, the one
    // action the dock's busy words name, apart from a skip, a put back or a change let go.
    const [moving, setMoving] = useState(false);
    const say = useStatus();

    // A saved round opened again from the scores, which its address and so the bar name, and
    // which goes back to its heading there once it is saved or let go.
    const changing = isChanging(game, draft);
    // The scores or the recap, whichever the round was opened from.
    const { search } = usePlace();
    const backToScores = (ended = false) => {
        navigate(atRound(id, draft.index, ended ? 'recap' : changedFrom(search)), {
            replace: true,
        });
    };

    /** Whether a tap would land in whichever step a change under way reaches. */
    const held = () => busy || summary.undoing();

    /** Lets the change go, and goes back to the scores once that is kept, or says why it is not. */
    const cancel = async () => {
        if (held()) return;
        summary.clear();
        setBusy(true);
        try {
            await play.dropDraft(id);
        } catch (error: unknown) {
            say(error instanceof Error ? error.message : 'The change could not be let go.');
            return;
        } finally {
            setBusy(false);
        }
        // A save the store refused is said by the screen's alert, and the change stays.
        if (keptOf(play, id)?.error === null) backToScores();
    };

    /**
     * Saves the round, with the players named first taken out of it, and says what each scored,
     * or what keeps it from being saved. `refusal` words what the rules refuse.
     */
    const saveRound = async (
        refusal: (problem: Problem) => string,
        out?: readonly string[],
        { quiet = false, values }: { quiet?: boolean; values?: readonly StepValue[] } = {}
    ) => {
        const index = (keptOf(play, id)?.draft ?? draft).index;
        const saved = await play.saveRound(id, out, values);
        // Said by the frame's toast, which stays on the page when the round ends the game and as a
        // changed round goes back to the scores. Each line is read from the round as it was saved
        // and scored, so a player taken out in the same change counts as out of it.
        if (saved.saved) {
            const after = keptOf(play, id);
            const round = toDraftRound(after?.saved.rounds[index]);
            const scored = after?.result.rounds[index];
            const scores = scored?.state === 'scored' ? scored.scores : {};
            const lines = game.saved.players.map((one) =>
                lineOf(one, round, scores[one], round.out.includes(one))
            );
            summary.offer(roundSummary(index, lines));
            // A round that ends the game opens its recap, where the table looks at the phone
            // together, and a changed round that does not goes back to the page it was opened from.
            const ended = saved.outcome === 'ended';
            if (changing) backToScores(ended);
            else if (ended) navigate(hrefOf('recap', id));
        } else if (saved.error !== null) say(saved.error);
        else if (!quiet)
            say(saved.problems[0] ? refusal(saved.problems[0]) : 'The round could not be saved.');
        return saved;
    };

    // Where focus goes once a skip or a put back is drawn, by the id of the button it lands on.
    const focusAfterDraw = useFocusAfterDraw();

    /**
     * Moves the round on with the value given for the step it is at: to the next step, or, after
     * the last, keeps the value where it is and saves the round at once, so the round never stands
     * with no step, which would take the round's view off the page.
     */
    const next = async (value: unknown, refusal: (problem: Problem) => string) => {
        // A second press while this one runs is let go by the dock's busy button.
        if (summary.undoing()) return;
        // Moving on begins the next entry, so the last summary and its Undo go before it does.
        summary.clear();
        setBusy(true);
        setMoving(true);
        try {
            const step = draft.step;
            if (stepAfter(game, value) === null) {
                await play.hold(id, value);
                await saveRound(refusal);
                return;
            }
            await play.enter(id, value);
            // What the rules made of the entry as it was entered, read once it is kept. An entry
            // the store refused is said by the screen's alert, so no summary says it is in.
            const kept = keptOf(play, id);
            const player = step?.player ?? null;
            if (kept?.error === null && kept.draft !== null && player !== null)
                summary.offer(
                    entrySummary(
                        lineOf(
                            player,
                            kept.draft.round,
                            kept.draft.preview.rounds[draft.index]?.scores[player],
                            false
                        )
                    )
                );
        } finally {
            setBusy(false);
            setMoving(false);
        }
    };

    /**
     * Who is next, as a sentence after a skip or a put back, where the turn moved to another player
     * than `before`, read from the round as kept. The header says who is next as well, a moment
     * before, so these words carry it, since they take its place on the status line.
     */
    const turnNow = (): string | null => keptOf(play, id)?.draft?.step?.player ?? null;
    const nextWords = (before: string | null): string => {
        const now = turnNow();
        return now === null || now === before ? '' : ` ${nameOf(now)} is next.`;
    };

    /**
     * Skips the player whose turn it is for the round, or, where `finishes`, skips them and saves
     * the round at once. The summary goes first, so its Undo cannot take back the skip.
     */
    const skip = async (
        player: string,
        before: number,
        finishes: boolean,
        refusal: (problem: Problem) => string
    ) => {
        if (held() || keptOf(play, id)?.draft?.step?.player !== player) return;
        summary.clear();
        setBusy(true);
        const name = nameOf(player);
        try {
            const without = [...draft.round.out, player];
            if (finishes) {
                const saved = await saveRound(refusal, without, { quiet: true });
                if (saved.saved || saved.error !== null) return;
                // The round is not whole without them, as where the player taken out had ended
                // it, so they are taken out and the round asks for what it still needs.
            }
            await play.setOut(id, without);
            if (keptOf(play, id)?.error !== null) return;
            say(`${skipWords(name, draft.index, before)}${nextWords(player)}`);
            // Focus stays on the skip, which names the next player, unless no one else can be
            // skipped, when it goes to the way to put this player back.
            if (!canSkip(game.saved.players, withOut(draft.round, game.saved.players, without)))
                focusAfterDraw(`put-back-${player}`);
        } catch (error: unknown) {
            say(error instanceof Error ? error.message : 'The player could not be skipped.');
        } finally {
            setBusy(false);
        }
    };

    /**
     * What a put back says: the player is back, and, in a round being entered, after whom they are
     * asked, with `rest` still out of it.
     */
    const backWords = (player: string, who: string, rest: readonly string[]): string => {
        const after = changing
            ? null
            : comesAfter(
                  {
                      game: game.saved.game,
                      players: game.saved.players,
                      round: withOut(draft.round, game.saved.players, rest),
                  },
                  player,
                  who
              );
        const where =
            after === null
                ? ''
                : after.now
                  ? `, and is next after ${nameOf(after.player)}`
                  : `, and is asked after ${nameOf(after.player)}`;
        return `${nameOf(who)} is back in round ${String(draft.index + 1)}${where}.`;
    };

    /**
     * Puts a skipped player back in the round, to be asked as the turn reaches them. `quiet` leaves
     * the words to a screen that says its own.
     */
    const back = async (
        player: string,
        who: string,
        { focus: move = true, quiet = false } = {}
    ) => {
        if (held()) return;
        // Whose turn it was, so a put back that moves the turn says who is next.
        const turn = turnNow();
        summary.clear();
        setBusy(true);
        try {
            const rest = draft.round.out.filter((one) => one !== who);
            await play.setOut(id, rest);
            if (keptOf(play, id)?.error !== null) return;
            if (!quiet) say(`${backWords(player, who, rest)}${nextWords(turn)}`);
            if (move) focusAfterDraw(focusAfterBack(rest));
        } catch (error: unknown) {
            say(error instanceof Error ? error.message : 'The player could not be put back.');
        } finally {
            setBusy(false);
        }
    };

    /**
     * Makes a change to the round while nothing else is, with the last summary taken away first,
     * and resolves to whether it was kept, saying why where it was not.
     */
    const run = async (
        work: () => Promise<unknown>,
        failed: string,
        { moves = false }: { readonly moves?: boolean } = {}
    ): Promise<boolean> => {
        if (held()) return false;
        summary.clear();
        setBusy(true);
        setMoving(moves);
        try {
            await work();
            // A save the store refused is said by the screen's alert.
            return keptOf(play, id)?.error === null;
        } catch (error: unknown) {
            say(error instanceof Error ? error.message : failed);
            return false;
        } finally {
            setBusy(false);
            setMoving(false);
        }
    };

    /** Moves the round to a step of its own, to correct an entry, or says why it did not. */
    const goTo = (step: SavedStep) =>
        run(() => play.goTo(id, step), 'The round could not go back to it.');

    return {
        id,
        draft,
        changing,
        busy,
        moving,
        say,
        held,
        cancel,
        saveRound,
        next,
        skip,
        back,
        goTo,
        run,
        /** Moves focus to the element with the id given, once the change that draws it is drawn. */
        focusOn: (to: string) => {
            focusAfterDraw(to);
        },
    };
};
