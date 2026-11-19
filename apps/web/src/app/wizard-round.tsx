import type { Problem } from '@gametabletally/scoring';
import { attachStepper } from '@jasonsdevspace/design-kit/controls';
import { Button, StatusLine, StepperField } from '@jasonsdevspace/design-kit/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import type { Play, StepValue } from '../play/play.js';
import { type DraftRound, playingIn } from '../play/steps.js';
import { isRecord } from '../store/format.js';
import { listOf } from '../website/games.js';
import { nameIn } from './opened-game.js';
import {
    canSkip,
    type GameWithDraft,
    outWords,
    RoundDock,
    totalBefore,
    useRound,
} from './round.js';
import type { RoundLine } from './round-summary.js';
import type { Summary } from './summary.js';

/*
 * A round of Wizard, entered in the two moments it is played in. Before the hand, every player's
 * bid on one screen, each with a stepper from nothing to the cards dealt. While the hand is played
 * the phone sits on the table showing the bids, large enough to read from across it, and who deals.
 * After the hand, every player's tricks on the same screen, each starting at their bid, so a bid
 * made costs no taps, with the tricks still to give counted against the cards dealt, and the round
 * saved once they add up. A player skipped for the round has no bid and no tricks.
 */

/** The cards in the deck, which the last round deals out between the players. */
const DECK = 60;

/** How many rounds a game of Wizard lasts for a number of players: the deck dealt out at the end. */
export const roundsFor = (players: number): number => DECK / players;

/**
 * Who deals a round: the first seat in the first round and one seat on in each round after,
 * passing over a player out of it, or null where no one is in it.
 */
export const dealerOf = (
    players: readonly string[],
    round: DraftRound,
    index: number
): string | null => {
    for (let seat = 0; seat < players.length; seat += 1) {
        const one = players[(index + seat) % players.length];
        if (one !== undefined && !round.out.includes(one)) return one;
    }
    return null;
};

/** A player's bid and tricks as the round holds them, each a number or nothing yet. */
export const countsOf = (
    entry: unknown
): { readonly bid: number | undefined; readonly tricks: number | undefined } => {
    const record = isRecord(entry) ? entry : {};
    const { bid, tricks } = record;
    return {
        bid: typeof bid === 'number' ? bid : undefined,
        tricks: typeof tricks === 'number' ? tricks : undefined,
    };
};

/** What a player's bid came to, in words: made, or missed and by how many. */
export const bidNote = (bid: number, tricks: number): string =>
    bid === tricks
        ? `made a bid of ${String(bid)}`
        : `missed a bid of ${String(bid)} by ${String(Math.abs(bid - tricks))}`;

/** Each player's line of a round of Wizard for the toast, with their bid made or missed. */
const wizardLines =
    (names: ReadonlyMap<string, string>) =>
    (player: string, round: DraftRound, score: number | undefined, out: boolean): RoundLine => {
        const name = nameIn(names, player);
        if (out) return { name, out };
        const { bid, tricks } = countsOf(round.entries[player]);
        return {
            name,
            ...(score === undefined ? {} : { score }),
            ...(bid === undefined || tricks === undefined ? {} : { note: bidNote(bid, tricks) }),
        };
    };

/** The tricks still to give against the cards dealt, in a sentence. */
export const tricksLeftWords = (given: number, dealt: number): string => {
    if (given === dealt) return `Every trick is given, ${String(dealt)} of ${String(dealt)}.`;
    const left = dealt - given;
    if (left > 0)
        return `${String(left)} ${left === 1 ? 'trick' : 'tricks'} left to give, of ${String(dealt)}.`;
    const over = -left;
    return `The tricks come to ${String(given)}, ${String(over)} more than the ${String(dealt)} dealt. Take ${over === 1 ? 'one' : String(over)} off.`;
};

/**
 * What the rules refuse in a round of Wizard, in the screen's own words, from the problem's code
 * and data. A code the screen cannot meet is worded by the package's own sentence.
 */
export const wizardRefusalWords = (problem: Problem): string =>
    problem.code === 'trick-total'
        ? tricksLeftWords(Number(problem.data.given), Number(problem.data.dealt))
        : problem.message;

/** A round's heading: which round of how many, the cards each player holds, and who deals. */
const RoundTitle = ({
    index,
    rounds,
    dealer,
}: {
    readonly index: number;
    readonly rounds: number;
    readonly dealer: string | null;
}) => (
    <div className="gtt-wizard-title">
        <p className="dk-eyebrow">
            {index + 1} {index === 0 ? 'card' : 'cards'} each
            {dealer === null ? null : `, ${dealer} deals`}
        </p>
        <p className="gtt-wizard-round">
            Round {index + 1} of {rounds}
        </p>
    </div>
);

/**
 * One player's count, a bid or tricks, on the kit's stepper, its label to the left, its buttons
 * named for the player and what is counted, and stopping at nothing and at the cards dealt.
 */
const Count = ({
    id,
    name,
    what,
    detail,
    value,
    max,
    off,
    onChange,
}: {
    readonly id: string;
    readonly name: string;
    readonly what: 'bid' | 'tricks';
    /** What sits after the name in the label, such as the player's bid beside their tricks. */
    readonly detail: string;
    readonly value: number;
    readonly max: number;
    readonly off: boolean;
    readonly onChange: (value: number) => void;
}) => {
    const field = useRef<HTMLInputElement>(null);
    useEffect(() => (field.current === null ? undefined : attachStepper(field.current)), []);
    return (
        <StepperField
            ref={field}
            id={id}
            inline
            tall
            label={
                detail === '' ? (
                    name
                ) : (
                    <>
                        {name} <span className="gtt-count-detail">{detail}</span>
                    </>
                )
            }
            subject={`${name}'s ${what}`}
            min={0}
            max={max}
            value={value}
            rangeError={`A count is from 0 to ${String(max)}.`}
            onChange={(event) => {
                const next = event.currentTarget.valueAsNumber;
                // A press while the round is saving is let go, as every key's is.
                if (!off && Number.isInteger(next) && next >= 0 && next <= max) onChange(next);
            }}
        />
    );
};

/**
 * Who is out of the round, with a way to put each back, and a way to skip each player still in it,
 * while the round keeps two.
 */
const OutRows = ({
    playing,
    out,
    names,
    skippable,
    off,
    onSkip,
    onBack,
    extra,
}: {
    readonly playing: readonly string[];
    readonly out: readonly string[];
    readonly names: ReadonlyMap<string, string>;
    readonly skippable: boolean;
    readonly off: boolean;
    readonly onSkip: (player: string) => void;
    readonly onBack: (player: string) => void;
    /** What shares the first row, such as the way back to the bids. */
    readonly extra?: ReactNode;
}) => {
    // The way to skip each player opens from one button, so the keys keep their place on a phone.
    const [open, setOpen] = useState(false);
    return (
        <>
            {skippable || extra !== undefined ? (
                <p className="dk-actions gtt-fine">
                    {extra}
                    {skippable ? (
                        <>
                            <Button
                                text
                                id="skip-player"
                                aria-expanded={open}
                                aria-controls="skip-players"
                                onClick={() => {
                                    setOpen((now) => !now);
                                }}
                            >
                                Skip a player this round
                            </Button>
                            <span id="skip-players" className="dk-actions" hidden={!open}>
                                {playing.map((one) => (
                                    <Button
                                        key={one}
                                        text
                                        id={`skip-${one}`}
                                        off={off}
                                        onClick={() => {
                                            setOpen(false);
                                            onSkip(one);
                                        }}
                                    >
                                        Skip {nameIn(names, one)}
                                    </Button>
                                ))}
                            </span>
                        </>
                    ) : null}
                </p>
            ) : null}
            {out.length === 0 ? null : (
                <p className="dk-actions gtt-fine">
                    <span>{outWords(out.map((one) => nameIn(names, one)))}</span>
                    {out.map((one) => (
                        <Button
                            key={one}
                            text
                            id={`put-back-${one}`}
                            off={off}
                            onClick={() => {
                                onBack(one);
                            }}
                        >
                            Put {nameIn(names, one)} back
                        </Button>
                    ))}
                </p>
            )}
        </>
    );
};

/** Which screen a round of Wizard is at. */
type Phase = 'bids' | 'hand' | 'tricks';

/**
 * Which screen a round is at: the bids while any is still to enter, then the hand, until the
 * table says it is over or a trick is in, then the tricks. A saved round opened again has its
 * tricks, so it goes from its bids straight to them.
 */
const phaseOf = (game: GameWithDraft, playing: readonly string[], over: boolean): Phase => {
    const { draft } = game;
    if (draft.step?.part === 'bid') return 'bids';
    const anyTricks = playing.some(
        (one) => countsOf(draft.round.entries[one]).tricks !== undefined
    );
    return over || anyTricks ? 'tricks' : 'hand';
};

/**
 * What each player bid or took, as set on the steppers, started again from what is kept as the
 * round reaches each moment: a bid, or nothing, and tricks, or the bid, so a made bid costs no taps.
 */
const useCounts = (game: GameWithDraft, playing: readonly string[], phase: Phase) => {
    const { draft } = game;
    const kept = () =>
        Object.fromEntries(
            playing.map((one) => {
                const { bid, tricks } = countsOf(draft.round.entries[one]);
                return [one, phase === 'bids' ? (bid ?? 0) : (tricks ?? bid ?? 0)];
            })
        );
    const moment = `${String(draft.index)}|${phase}|${playing.join(',')}`;
    const [counts, setCounts] = useState(() => ({ moment, of: kept() }));
    const shown = counts.moment === moment ? counts : { moment, of: kept() };
    if (shown !== counts) setCounts(shown);
    const valueOf = (one: string) => shown.of[one] ?? 0;
    const set = (one: string, value: number) => {
        setCounts((now) => ({ ...now, of: { ...now.of, [one]: value } }));
    };
    return { valueOf, set };
};

/** The label of the button that moves a round of Wizard on, at each of its moments. */
const labelOf = (phase: Phase, changing: boolean, index: number): string => {
    if (phase === 'bids') return 'Save the bids';
    if (phase === 'hand') return 'Enter the tricks';
    return changing ? `Save round ${String(index + 1)}` : 'Save the round';
};

/** The bids shown while the hand is played, each large enough to read from across the table. */
const HandView = ({
    playing,
    names,
    dealer,
    valueOf,
}: {
    readonly playing: readonly string[];
    readonly names: ReadonlyMap<string, string>;
    readonly dealer: string | null;
    readonly valueOf: (player: string) => number;
}) => (
    <section className="gtt-keys" aria-labelledby="hand-title">
        <h2 id="hand-title" className="dk-eyebrow">
            The bids, while the hand is played
        </h2>
        <ul className="gtt-bids" role="list">
            {playing.map((one) => (
                <li key={one}>
                    <span className="gtt-bid-name">
                        {nameIn(names, one)}
                        {one === dealer ? <span className="gtt-count-detail"> deals</span> : null}
                    </span>
                    <span className="gtt-bid">
                        <span className="dk-visually-hidden">, bid </span>
                        {valueOf(one)}
                    </span>
                </li>
            ))}
        </ul>
    </section>
);

/** Every player's bid, or their tricks, on a stepper each, with what they add up to. */
const CountsView = ({
    game,
    playing,
    names,
    dealer,
    what,
    off,
    counts,
    left,
}: {
    readonly game: GameWithDraft;
    readonly playing: readonly string[];
    readonly names: ReadonlyMap<string, string>;
    readonly dealer: string | null;
    readonly what: 'bid' | 'tricks';
    readonly off: boolean;
    readonly counts: ReturnType<typeof useCounts>;
    /** The tricks still to give, in words. */
    readonly left: string;
}) => {
    const { draft } = game;
    const dealt = draft.index + 1;
    const given = playing.reduce((sum, one) => sum + counts.valueOf(one), 0);
    // The bid beside each player's tricks, and who deals beside the bids.
    const detailOf = (one: string) => {
        if (what === 'tricks') return `bid ${String(countsOf(draft.round.entries[one]).bid ?? 0)}`;
        return one === dealer ? 'deals' : '';
    };
    return (
        <section className="gtt-keys" aria-label={what === 'bid' ? 'Bids' : 'Tricks taken'}>
            {what === 'tricks' ? (
                <p className="dk-field-hint" id="tricks-left">
                    {left}
                </p>
            ) : (
                <p className="dk-field-hint">
                    The bids come to {given} for {dealt} {dealt === 1 ? 'card' : 'cards'} each.
                </p>
            )}
            <div className="gtt-counts">
                {playing.map((one) => (
                    <Count
                        key={`${what}|${one}`}
                        id={`${what}-${one}`}
                        name={nameIn(names, one)}
                        what={what}
                        detail={detailOf(one)}
                        value={counts.valueOf(one)}
                        max={dealt}
                        off={off}
                        onChange={(value) => {
                            counts.set(one, value);
                        }}
                    />
                ))}
            </div>
        </section>
    );
};

/**
 * A round of Wizard being entered, at whichever of its moments it is: the bids, the hand, or the
 * tricks. Each moment keeps the round's title, its way to skip a player, and its dock.
 */
export const WizardRound = ({
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
    const id = game.saved.id;
    const players = game.saved.players;
    const nameOf = (one: string) => nameIn(names, one);
    const playing = playingIn(players, draft.round);
    const dealt = draft.index + 1;
    const dealer = dealerOf(players, draft.round, draft.index);
    const actionsOf = useRound({ play, game, names, summary, lineOf: wizardLines(names) });
    const { busy, changing, line, say } = actionsOf;
    // The table says the hand is over by asking for the tricks, which is kept for this round only.
    const [over, setOver] = useState<number | null>(null);
    const phase = phaseOf(game, playing, changing || over === draft.index);
    const counts = useCounts(game, playing, phase);
    const given = playing.reduce((sum, one) => sum + counts.valueOf(one), 0);

    // The tricks still to give are said as they change, once the tricks are being entered.
    const left = tricksLeftWords(given, dealt);
    const lastSaid = useRef(left);
    useEffect(() => {
        if (lastSaid.current === left) return;
        lastSaid.current = left;
        if (phase === 'tricks') say(left);
    }, [left, phase, say]);

    // Where focus goes once a skip or a put back is drawn, by the id it lands on.
    const [focus, setFocus] = useState<{ readonly id: string } | null>(null);
    useEffect(() => {
        if (focus !== null) document.getElementById(focus.id)?.focus();
    }, [focus]);

    const valuesOf = (what: 'bid' | 'tricks'): StepValue[] =>
        playing.map((one) => ({ step: { part: what, player: one }, value: counts.valueOf(one) }));

    const saveBids = async () => {
        const done = await actionsOf.run(
            () => play.enterAll(id, valuesOf('bid')),
            'The bids could not be saved.'
        );
        if (!done) return;
        const bids = playing.map((one) => `${nameOf(one)} ${String(counts.valueOf(one))}`);
        summary.offer(
            `The bids for round ${String(draft.index + 1)} are in: ${listOf(bids, 'and')}.`
        );
    };

    const saveTricks = async () => {
        if (given !== dealt || actionsOf.held()) return;
        summary.clear();
        await actionsOf.saveRound(wizardRefusalWords, undefined, { values: valuesOf('tricks') });
    };

    const skip = async (one: string) => {
        const done = await actionsOf.run(
            () => play.setOut(id, [...draft.round.out, one]),
            'The player could not be skipped.'
        );
        if (!done) return;
        const name = nameOf(one);
        say(
            `${name} is out of round ${String(draft.index + 1)}, with no score for it. ${name}'s total stays at ${String(totalBefore(game, one, draft.index))}.`
        );
        setFocus({ id: `put-back-${one}` });
    };

    const back = async (one: string) => {
        await actionsOf.back('', one);
        // A player put back has no bid, so the round goes back to the bids, at theirs.
        setFocus({ id: `bid-${one}` });
    };

    const changeBids = () => {
        const first = playing[0];
        if (first !== undefined) void actionsOf.goTo({ part: 'bid', player: first });
    };

    const below = (
        <OutRows
            playing={playing}
            out={draft.round.out}
            names={names}
            skippable={canSkip(players, draft.round)}
            off={busy}
            onSkip={(one) => void skip(one)}
            onBack={(one) => void back(one)}
            extra={
                phase === 'bids' || changing ? undefined : (
                    <Button text off={busy} onClick={changeBids}>
                        Change the bids
                    </Button>
                )
            }
        />
    );
    const parts = { playing, names, dealer };

    return (
        <div className="gtt-game gtt-wizard">
            <div className="gtt-game-top">
                {changing ? null : actions}
                <RoundTitle
                    index={draft.index}
                    rounds={roundsFor(players.length)}
                    dealer={dealer === null ? null : nameOf(dealer)}
                />
                {below}
            </div>
            {phase === 'hand' ? (
                <HandView {...parts} valueOf={counts.valueOf} />
            ) : (
                <CountsView
                    {...parts}
                    game={game}
                    what={phase === 'bids' ? 'bid' : 'tricks'}
                    off={busy}
                    counts={counts}
                    left={left}
                />
            )}
            <StatusLine ref={line} />
            {game.error === null ? null : <p role="alert">{game.error}</p>}
            <RoundDock
                id={id}
                index={draft.index}
                changing={changing}
                off={busy}
                refused={phase === 'tricks' && given !== dealt}
                why="tricks-left"
                label={labelOf(phase, changing, draft.index)}
                onNext={() => {
                    if (phase === 'bids') void saveBids();
                    else if (phase === 'hand') {
                        summary.clear();
                        setOver(draft.index);
                    } else void saveTricks();
                }}
                onCancel={() => void actionsOf.cancel()}
            />
        </div>
    );
};
