import {
    FLIP_7_BONUS,
    FLIP_7_MODIFIERS,
    type Flip7Entry,
    type Flip7Modifier,
    type Problem,
} from '@gametabletally/scoring';
import { Button, StatusLine } from '@jasonsdevspace/design-kit/react';
import { type ReactNode, useEffect, useState } from 'react';

import { Link, navigate, usePlace } from '../navigation.js';
import { type GameInPlay, type Play, stepAfter } from '../play/play.js';
import { atRound, changedFrom, changingRoundOf, hrefOf, roundIn } from '../routes.js';
import { isRecord } from '../store/format.js';
import { Dock } from './AppFrame.js';
import { canEnter, gameNameOf } from './in-play.js';
import { nameIn, type OpenedGameProps, useGame, WithOpenedGame } from './opened-game.js';
import { entrySummary, flip7Note, type RoundLine, roundSummary } from './round-summary.js';
import { ScoreHeader } from './ScoreHeader.js';
import { useStatus } from './status.js';
import { type Summary, useDiscard, useSummary } from './summary.js';

/*
 * The game in play: the score header on top, and below it, in reach of a thumb, the keys a round
 * is entered with, player by player in seat order. Flip 7 is entered by tapping the cards a player
 * ends the round holding. Each tap is kept at once, so a page loaded again in the middle of a hand
 * comes back to it, and the header's total, which the rules work out from what was kept, shows the
 * round as it stands. The button for the next player names them, and after the last it saves the
 * round. After each entry and each save the frame's toast says what each player scored, with any
 * rule that changed a score in words, and offers one Undo, until the next entry begins. Nothing
 * here adds anything up.
 */

/** The number cards, from 0 to 12. */
const NUMBERS = Array.from({ length: 13 }, (_, card) => card);

/** How many different numbers end a round of Flip 7, and what its bonus for them adds. */
const { numbers: FLIP, points: BONUS } = FLIP_7_BONUS;

const EMPTY: Flip7Entry = { numbers: [], modifiers: [], bust: false };

/** A player's hand as the round holds it, or an empty one where nothing is entered yet. */
export const handOf = (entry: unknown): Flip7Entry => {
    if (!isRecord(entry)) return EMPTY;
    const { numbers, modifiers, bust } = entry;
    return {
        numbers: Array.isArray(numbers)
            ? numbers.filter((card): card is number => typeof card === 'number')
            : [],
        modifiers: Array.isArray(modifiers)
            ? modifiers.filter((card): card is Flip7Modifier =>
                  FLIP_7_MODIFIERS.some((known) => known === card)
              )
            : [],
        bust: bust === true,
    };
};

/** A list with a card taken out where it is held, and put in, in order, where it is not. */
const toggled = <Card,>(cards: readonly Card[], card: Card, order: readonly Card[]): Card[] =>
    cards.includes(card)
        ? cards.filter((held) => held !== card)
        : order.filter((one) => one === card || cards.includes(one));

/**
 * What the rules refuse in a hand, in the screen's own words, from the problem's code and data. A
 * code the screen cannot meet is worded by the package's own sentence.
 */
export const refusalWords = (problem: Problem): string => {
    if (problem.code === 'too-many-numbers')
        return `A round ends at ${String(problem.data.max)} numbers, so a hand holds no more. Take one off.`;
    if (problem.code === 'number-twice')
        return `The ${String(problem.data.number)} is held twice, which is a bust.`;
    if (problem.code === 'modifier-twice') return `The deck holds one ${problem.data.modifier}.`;
    return problem.message;
};

/** How a player's total adds up, in a sentence, with the round as it stands. */
export const lineOf = ({
    before,
    round,
    first,
    hand,
}: {
    readonly before: number;
    readonly round: number;
    readonly first: boolean;
    readonly hand: Flip7Entry;
}): string => {
    const now = hand.bust
        ? 'bust this round, so nothing'
        : hand.numbers.length === FLIP
          ? `${String(round)} this round, with ${String(BONUS)} for ${String(FLIP)} numbers`
          : `${String(round)} this round`;
    return first
        ? `${now.charAt(0).toUpperCase()}${now.slice(1)}.`
        : `${String(before)} before this round, and ${now}.`;
};

/**
 * The keys a Flip 7 hand is tapped in with: Bust first, since a table settles whether a player bust
 * before what they hold, then the numbers, what the rules refuse in them, and the modifiers. Bust
 * keeps its name, its pressed state saying whether the player bust, so the keys it turns off sit
 * under it and the button for the next player is the whole hand away.
 */
export const Flip7Keys = ({
    name,
    hand,
    why,
    off = false,
    onChange,
}: {
    readonly name: string;
    readonly hand: Flip7Entry;
    /** What the rules refuse in the hand, in words, or an empty string. */
    readonly why: string;
    /** Whether every key is off, as while the turn moves on. */
    readonly off?: boolean;
    readonly onChange: (hand: Flip7Entry) => void;
}) => (
    <section className="gtt-keys" aria-label={`${name}'s cards`}>
        <div className="dk-button-grid gtt-bust" role="group" aria-label="Bust">
            <Button
                pressed={hand.bust}
                off={off}
                aria-describedby={hand.bust ? 'bust-hint' : undefined}
                onClick={() => {
                    if (off) return;
                    onChange(hand.bust ? EMPTY : { ...EMPTY, bust: true });
                }}
            >
                Bust
            </Button>
        </div>
        {hand.bust ? (
            <div className="dk-field-hint" id="bust-hint">
                {name} bust, so nothing counts this round. Press Bust again to take it back.
            </div>
        ) : null}
        <div
            className="dk-button-grid gtt-numbers"
            role="group"
            aria-label="Number cards"
            aria-describedby={why === '' ? undefined : 'hand-why'}
        >
            {NUMBERS.map((card) => (
                <Button
                    key={card}
                    pressed={hand.numbers.includes(card)}
                    off={hand.bust || off}
                    onClick={() => {
                        if (hand.bust || off) return;
                        onChange({ ...hand, numbers: toggled(hand.numbers, card, NUMBERS) });
                    }}
                >
                    {card}
                </Button>
            ))}
        </div>
        {why === '' ? null : (
            <div className="dk-field-hint" id="hand-why">
                {why}
            </div>
        )}
        <div className="dk-button-grid gtt-modifiers" role="group" aria-label="Modifier cards">
            {FLIP_7_MODIFIERS.map((card) => (
                <Button
                    key={card}
                    pressed={hand.modifiers.includes(card)}
                    off={hand.bust || off}
                    onClick={() => {
                        if (hand.bust || off) return;
                        onChange({
                            ...hand,
                            modifiers: toggled(hand.modifiers, card, FLIP_7_MODIFIERS),
                        });
                    }}
                >
                    {card === 'x2' ? (
                        <>
                            <span aria-hidden="true">×2</span>
                            <span className="dk-visually-hidden">Times 2</span>
                        </>
                    ) : (
                        card
                    )}
                </Button>
            ))}
        </div>
    </section>
);

/**
 * A player's total over the scored rounds before the one being entered, so a reopened round is
 * never counted twice, once as saved and again as it stands.
 */
const totalBefore = (game: GameInPlay, player: string, index: number): number =>
    game.result.rounds
        .slice(0, index)
        .reduce(
            (total, round) =>
                round.state === 'scored' ? total + (round.scores[player] ?? 0) : total,
            0
        );

/** A game as the model holds it now, read once a change is kept. */
const keptOf = (play: Play, id: string): GameInPlay | undefined =>
    play.snapshot().games.find(({ saved }) => saved.id === id);

/** A player's line of a round of Flip 7, from their hand and the score the rules gave it. */
const flip7Line = (
    name: string,
    hand: Flip7Entry,
    score: number | undefined,
    out = false
): RoundLine =>
    out
        ? { name, out }
        : { name, ...(score === undefined ? {} : { score }), note: flip7Note(hand) };

/**
 * Whether a round's draft is a saved round opened again to change it, which the model walks seat
 * by seat, as it counts the saved rounds.
 */
const isChanging = (game: GameInPlay, draft: NonNullable<GameInPlay['draft']>): boolean =>
    draft.index < game.saved.rounds.length;

/**
 * A round's dock: the button that moves the round on, last, nearest the thumb, and beside it the
 * way to the scores, or, for a saved round opened again, the way to let the change go.
 */
const RoundDock = ({
    id,
    index,
    changing,
    off,
    refused,
    label,
    onNext,
    onCancel,
}: {
    readonly id: string;
    readonly index: number;
    readonly changing: boolean;
    readonly off: boolean;
    /** Whether the rules refuse the hand, which the keys say why beside them. */
    readonly refused: boolean;
    readonly label: string;
    readonly onNext: () => void;
    readonly onCancel: () => void;
}) => (
    <Dock>
        <div className="gtt-dock-row">
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
                accent
                tall
                off={refused || off}
                aria-describedby={refused ? 'hand-why' : undefined}
                onClick={onNext}
            >
                {label}
            </Button>
        </div>
    </Dock>
);

/**
 * A round of Flip 7 being entered. It stays on the page from player to player, so the button for
 * the next player keeps focus as the turn moves on, and the header and the status line, staying
 * too, say who is next and that a round was saved.
 */
const Flip7Round = ({
    play,
    game,
    player,
    names,
    summary,
    actions,
}: {
    readonly play: Play;
    readonly summary: Summary;
    /** The ways out of the game, above its header, where the round is not one being changed. */
    readonly actions: ReactNode;
    readonly game: GameInPlay & { readonly draft: NonNullable<GameInPlay['draft']> };
    readonly player: string;
    readonly names: ReadonlyMap<string, string>;
}) => {
    const { draft } = game;
    const id = game.saved.id;
    const nameOf = (one: string) => nameIn(names, one);
    const name = nameOf(player);
    const before = totalBefore(game, player, draft.index);
    const round = draft.preview.rounds[draft.index]?.scores[player] ?? 0;
    const problem = draft.preview.problems.find(
        (one) => one.round === draft.index && one.player === player
    );
    const why = problem ? refusalWords(problem) : '';
    const turn = `${String(draft.index)}|${player}`;
    // The hand as tapped, which runs ahead of what is kept while a save takes, so two taps made at
    // once both count, and the round's last score the rules took, which the header keeps showing
    // while a hand is refused, so a refusal never reads as a total of nothing. Both start again
    // from what is kept at each turn.
    const [state, setState] = useState(() => ({
        turn,
        hand: handOf(draft.round.entries[player]),
        taken: round,
    }));
    let shown = state;
    if (state.turn !== turn)
        shown = { turn, hand: handOf(draft.round.entries[player]), taken: round };
    else if (problem === undefined && state.taken !== round) shown = { ...state, taken: round };
    if (shown !== state) setState(shown);
    const { hand, taken } = shown;
    const following = stepAfter(game, hand)?.player ?? null;
    const [busy, setBusy] = useState(false);
    const [line, say] = useStatus();
    // A refusal is said once as it appears, since focus is on the key that caused it.
    useEffect(() => {
        if (why !== '') say(why);
    }, [why, say]);

    const change = (next: Flip7Entry) => {
        // While a hand is entered or a round saved, the turn is moving on, and a tap would land
        // in whichever step the save reaches.
        if (busy || summary.undoing()) return;
        // The next entry has begun, so the last summary and its Undo go.
        summary.clear();
        setState((now) => ({ ...now, hand: next }));
        void play.hold(id, next);
    };

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

    /** Lets the change go, and goes back to the scores once that is kept, or says why it is not. */
    const cancel = async () => {
        if (busy || summary.undoing()) return;
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

    const saveRound = async () => {
        // The round as the rules make it with the last hand kept, read before the save takes the
        // draft away.
        const kept = keptOf(play, id)?.draft ?? draft;
        const scores = kept.preview.rounds[kept.index]?.scores ?? {};
        const lines = game.saved.players.map((one) =>
            flip7Line(
                nameOf(one),
                handOf(kept.round.entries[one]),
                scores[one],
                kept.round.out.includes(one)
            )
        );
        const saved = await play.saveRound(id);
        // Said by the frame's toast, which stays on the page when the round ends the game and as a
        // changed round goes back to the scores.
        if (saved.saved) {
            summary.offer(roundSummary(kept.index, lines));
            // A round that ends the game opens its recap, where the table looks at the phone
            // together, and a changed round that does not goes back to the page it was opened from.
            const ended = saved.outcome === 'ended';
            if (changing) backToScores(ended);
            else if (ended) navigate(hrefOf('recap', id));
        } else if (saved.error !== null) say(saved.error);
        else
            say(
                saved.problems[0]
                    ? refusalWords(saved.problems[0])
                    : 'The round could not be saved.'
            );
    };

    const next = async () => {
        if (why !== '' || busy || summary.undoing()) return;
        // Moving on begins the next entry, so the last summary and its Undo go before it does.
        summary.clear();
        setBusy(true);
        try {
            // After the last player the hand is kept where it is and the round saved at once, so
            // the round never stands with no step, which would take this view off the page.
            if (following === null) {
                await play.hold(id, hand);
                await saveRound();
            } else {
                await play.enter(id, hand);
                // What the rules made of the hand as it was entered, read once it is kept. An
                // entry the store refused is said by the screen's alert, so no summary says it is in.
                const kept = keptOf(play, id);
                if (kept?.error === null)
                    summary.offer(
                        entrySummary(
                            flip7Line(
                                name,
                                hand,
                                kept.draft?.preview.rounds[draft.index]?.scores[player]
                            )
                        )
                    );
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="gtt-game">
            <div className="gtt-game-top">
                {changing ? null : actions}
                <ScoreHeader
                    name={name}
                    total={before + taken}
                    line={lineOf({ before, round: taken, first: draft.index === 0, hand })}
                />
            </div>
            <Flip7Keys name={name} hand={hand} why={why} off={busy} onChange={change} />
            <StatusLine ref={line} />
            {game.error === null ? null : <p role="alert">{game.error}</p>}
            <RoundDock
                id={id}
                index={draft.index}
                changing={changing}
                off={busy}
                refused={why !== ''}
                label={
                    following !== null
                        ? `Next: ${nameOf(following)}`
                        : changing
                          ? `Save round ${String(draft.index + 1)}`
                          : 'Save the round'
                }
                onNext={() => void next()}
                onCancel={() => void cancel()}
            />
        </div>
    );
};

/**
 * The ways out of a game in play, at the top of its screen, out of the way of the keys: leaving it
 * as it is, which the start screen offers to continue, and discarding it, at once, with the
 * frame's toast offering Undo, as the app does in place of asking first.
 */
const GameActions = ({
    play,
    id,
    gameName,
}: {
    readonly play: Play;
    readonly id: string;
    readonly gameName: string;
}) => {
    const [line, say] = useStatus();
    const discardGame = useDiscard(play);
    const discard = async () => {
        const done = await discardGame(id, gameName);
        if (done === true) navigate(hrefOf('play'));
        else if (done !== null) say(done);
    };
    return (
        <>
            <p className="dk-actions gtt-game-actions">
                <Link className="dk-button dk-button-text" href={hrefOf('play')}>
                    Leave for now
                </Link>
                <Button text onClick={() => void discard()}>
                    Discard the game
                </Button>
            </p>
            <StatusLine ref={line} />
        </>
    );
};

/** The round being entered of one game, drawn from the model as it stands. */
const Entry = ({
    play,
    id,
    names,
}: {
    readonly play: Play;
    readonly id: string;
    readonly names: ReadonlyMap<string, string>;
}) => {
    const summary = useSummary(play);
    const game = useGame(play, id);
    // The address names a round being changed, so the bar and the page's title do. One arrived at
    // another way, such as Back to the game, is put right in place, as is one that names a round
    // no longer opened.
    const { search } = usePlace();
    const named = roundIn(search);
    const from = changedFrom(search);
    const opened = game?.draft && isChanging(game, game.draft) ? game.draft.index + 1 : null;
    useEffect(() => {
        if (game === undefined || named === opened) return;
        navigate(opened === null ? hrefOf('game', id) : changingRoundOf(id, opened - 1, from), {
            replace: true,
        });
    }, [game, named, opened, id, from]);
    if (!game) return <p>This game is not on this phone.</p>;
    const gameName = gameNameOf(game.saved.game);
    const { draft } = game;
    // The scores, from the dock, wherever the screen has no round to enter.
    const scores = (
        <Dock>
            <Link className="dk-button dk-button-accent dk-button-tall" href={hrefOf('scores', id)}>
                Scores
            </Link>
        </Dock>
    );
    // A finished game's screen says so, and its recap is in the dock.
    if (draft === null)
        return (
            <>
                <p>This game of {gameName} is over.</p>
                <Dock>
                    <Link
                        className="dk-button dk-button-accent dk-button-tall"
                        href={hrefOf('recap', id)}
                    >
                        See the recap
                    </Link>
                </Dock>
            </>
        );
    const actions = <GameActions play={play} id={id} gameName={gameName} />;
    const player = draft.step?.player ?? null;
    if (player === null)
        return (
            <>
                {isChanging(game, draft) ? null : actions}
                <p>Every score of the round is in.</p>
            </>
        );
    if (!canEnter(game.saved.game))
        return (
            <div className="gtt-game">
                <div className="gtt-game-top">
                    {isChanging(game, draft) ? null : actions}
                    <ScoreHeader
                        name={nameIn(names, player)}
                        total={game.result.totals[player] ?? 0}
                        line=""
                    />
                </div>
                <p>Entering a round of {gameName} comes to the app after Flip 7.</p>
                {scores}
            </div>
        );
    return (
        <Flip7Round
            play={play}
            game={{ ...game, draft }}
            player={player}
            names={names}
            summary={summary}
            actions={actions}
        />
    );
};

export type GameScreenProps = OpenedGameProps;

/**
 * The game in play named by the address, read once the screen is running, so the prerendered page
 * holds only the frame. The database stays open while the screen is shown, since every tap saves.
 */
export const GameScreen = (props: GameScreenProps) => (
    <WithOpenedGame {...props}>
        {({ id, play, names }) => <Entry play={play} id={id} names={names} />}
    </WithOpenedGame>
);
