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
import { type Play, stepAfter } from '../play/play.js';
import { changedFrom, changingRoundOf, hrefOf, roundIn } from '../routes.js';
import { isRecord, type SavedStep } from '../store/format.js';
import { Dock } from './AppFrame.js';
import { Failure } from './failure.js';
import { gameNameOf } from './in-play.js';
import { nameIn, type OpenedGameProps, useGame, WithOpenedGame } from './opened-game.js';
import {
    canSkip,
    type GameWithDraft,
    isChanging,
    nextLabel,
    RoundDock,
    SkipRows,
    totalBefore,
    useRound,
} from './round.js';
import { flip7Note, type RoundLine } from './round-summary.js';
import { useRoving } from './roving.js';
import { ScoreHeader } from './ScoreHeader.js';
import { SkyjoEnder, SkyjoRound } from './skyjo-round.js';
import { useStatus } from './status.js';
import { type Summary, useDiscard, useSummary } from './summary.js';
import { WizardRound } from './wizard-round.js';

/*
 * The game in play: the score header on top, and below it, in reach of a thumb, the keys a round
 * is entered with, player by player in seat order. Flip 7 is entered by tapping the cards a player
 * ends the round holding. Each tap is kept at once, so a page loaded again in the middle of a hand
 * comes back to it, and the header's total, which the rules work out from what was kept, shows the
 * round as it stands. The button for the next player names them, and after the last it saves the
 * round. After each entry and each save the frame's toast says what each player scored, with any
 * rule that changed a score in words, and offers one Undo, until the next entry begins. A player
 * can be skipped for the round from under the header, the whole hand away from that button, and
 * put back until the round is saved. Nothing here adds anything up.
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
 * under it and the button for the next player is the whole hand away. The numbers and the modifiers
 * are one stop each for the Tab key, with the arrow keys moving between their cards.
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
}) => {
    const numbers = useRoving(name);
    const modifiers = useRoving(name);
    return (
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
                onFocus={numbers.onFocus}
                onClick={numbers.onClick}
                onKeyDown={numbers.onKeyDown}
            >
                {NUMBERS.map((card, at) => (
                    <Button
                        key={card}
                        tabIndex={numbers.tabIndexOf(at)}
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
            <div
                className="dk-button-grid gtt-modifiers"
                role="group"
                aria-label="Modifier cards"
                onFocus={modifiers.onFocus}
                onClick={modifiers.onClick}
                onKeyDown={modifiers.onKeyDown}
            >
                {FLIP_7_MODIFIERS.map((card, at) => (
                    <Button
                        key={card}
                        tabIndex={modifiers.tabIndexOf(at)}
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
};

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
    readonly game: GameWithDraft;
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
    const following = stepAfter(game, hand);
    const actionsOf = useRound({
        play,
        game,
        names,
        summary,
        lineOf: (one, kept, score, out) =>
            flip7Line(nameOf(one), handOf(kept.entries[one]), score, out),
    });
    const { busy, changing, line, say } = actionsOf;
    // A refusal is said once as it appears, since focus is on the key that caused it.
    useEffect(() => {
        if (why !== '') say(why);
    }, [why, say]);

    const change = (next: Flip7Entry) => {
        if (actionsOf.held()) return;
        // The next entry has begun, so the last summary and its Undo go.
        summary.clear();
        setState((now) => ({ ...now, hand: next }));
        void play.hold(id, next);
    };

    const out = draft.round.out;
    // Skipping the last player still to enter saves the round. A saved round opened again is
    // saved only from its own button, so a skip there takes the player out and nothing more.
    const finishes = following === null && !changing;

    return (
        <div className="gtt-game">
            <div className="gtt-game-top">
                {changing ? null : actions}
                <ScoreHeader
                    name={name}
                    total={before + taken}
                    line={lineOf({ before, round: taken, first: draft.index === 0, hand })}
                />
                <SkipRows
                    name={name}
                    out={out.map((one) => ({ player: one, name: nameOf(one) }))}
                    skippable={canSkip(game.saved.players, draft.round)}
                    last={finishes}
                    off={busy}
                    onSkip={() => void actionsOf.skip(player, before, finishes, refusalWords)}
                    onBack={(who) => void actionsOf.back(player, who)}
                />
            </div>
            <Flip7Keys name={name} hand={hand} why={why} off={busy} onChange={change} />
            <StatusLine ref={line} />
            <Failure words={game.error} />
            <RoundDock
                id={id}
                index={draft.index}
                changing={changing}
                off={busy}
                refused={why !== ''}
                label={nextLabel(following, names, draft.index, changing)}
                onNext={() => {
                    if (why === '') void actionsOf.next(hand, refusalWords);
                }}
                onCancel={() => void actionsOf.cancel()}
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
    return (
        <RoundFor
            play={play}
            game={{ ...game, draft }}
            names={names}
            summary={summary}
            actions={<GameActions play={play} id={id} gameName={gameName} />}
        />
    );
};

/**
 * Whether the round has just come back to a player's entry from who ended it, read from the part
 * of the round each draw is at, so the player come back to can be told so.
 */
const useCameBack = (part: string | null): boolean => {
    const [was, setWas] = useState(part);
    const [back, setBack] = useState(false);
    if (was !== part) {
        setBack(was === 'ender');
        setWas(part);
    }
    return back;
};

/**
 * Which screen draws the step a round is at: a round of Wizard, entered a moment at a time for
 * every player on one screen, who ended a round of Skyjo, which is a step of the round's own, a
 * player's entry in Skyjo or Flip 7, or none, for a round whose every entry is in or a game this
 * phone has no screen for.
 */
const screenOf = (
    game: string,
    step: SavedStep | null
): 'wizard' | 'ender' | 'skyjo' | 'flip-7' | null => {
    if (step === null) return null;
    if (game === 'wizard') return 'wizard';
    if (game === 'skyjo') return step.part === 'ender' ? 'ender' : 'skyjo';
    return game === 'flip-7' ? 'flip-7' : null;
};

/**
 * The step a round is at, drawn by its game's own screen: a player's entry, or who ended a round of
 * Skyjo, which is a step of the round's own, or a word that the game cannot be entered here.
 */
const RoundFor = ({
    play,
    game,
    names,
    summary,
    actions,
}: {
    readonly play: Play;
    readonly game: GameWithDraft;
    readonly names: ReadonlyMap<string, string>;
    readonly summary: Summary;
    readonly actions: ReactNode;
}) => {
    const { draft } = game;
    const step = draft.step;
    const parts = { play, game, names, summary, actions };
    const arrived = useCameBack(step?.part ?? null);
    const player = step?.player ?? null;
    const kind = game.saved.game;
    const screen = screenOf(kind, step);
    if (screen === 'wizard') return <WizardRound {...parts} />;
    if (screen === 'ender') return <SkyjoEnder {...parts} />;
    if (screen === 'skyjo' && player !== null)
        return <SkyjoRound {...parts} player={player} arrived={arrived} />;
    if (screen === 'flip-7' && player !== null) return <Flip7Round {...parts} player={player} />;
    return (
        <div className="gtt-game">
            <div className="gtt-game-top">{isChanging(game, draft) ? null : actions}</div>
            <p>
                {player === null
                    ? 'Every score of the round is in.'
                    : `A game of ${gameNameOf(kind)} cannot be entered on this phone, though its scores can be read.`}
            </p>
            <Dock>
                <Link
                    className="dk-button dk-button-accent dk-button-tall"
                    href={hrefOf('scores', game.saved.id)}
                >
                    Scores
                </Link>
            </Dock>
        </div>
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
