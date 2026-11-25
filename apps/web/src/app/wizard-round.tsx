import { type Problem, wizardRounds } from '@gametabletally/scoring';
import { attachStepper } from '@jasonsdevspace/design-kit/controls';
import {
    Button,
    StepperField,
    useFocusAfterDraw,
    useStatus,
} from '@jasonsdevspace/design-kit/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import type { Play, StepValue } from '../play/play.js';
import { type DraftRound, playingIn } from '../play/steps.js';
import { isRecord } from '../store/format.js';
import { listOf } from '../website/games.js';
import { Failure } from './failure.js';
import { nameIn } from './opened-game.js';
import {
    canSkip,
    type GameWithDraft,
    keptOf,
    outWords,
    RoundDock,
    skipWords,
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

/** The tricks still to enter against the tricks in the hand, in a sentence. */
export const tricksLeftWords = (given: number, dealt: number): string => {
    if (given === dealt) return `Every trick is in, ${String(dealt)} of ${String(dealt)}.`;
    const left = dealt - given;
    if (left > 0)
        return `${String(left)} ${left === 1 ? 'trick' : 'tricks'} still to enter, of ${String(dealt)} in the hand.`;
    return `The tricks come to ${String(given)}, ${String(-left)} more than the ${String(dealt)} in the hand. Take ${String(-left)} off.`;
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
    <div className="dk-stack dk-stack-pair gtt-wizard-title">
        <p className="dk-eyebrow">
            {index + 1} {index === 0 ? 'card' : 'cards'} each
            {dealer === null ? null : `, ${dealer} deals`}
        </p>
        <h2 className="gtt-wizard-round">
            Round {index + 1} of {rounds}
        </h2>
    </div>
);

/**
 * One player's count, a bid or tricks, on the kit's stepper, its label to the left with the player's
 * name first, its buttons named for the player and what is counted, and stopping at nothing and at
 * the cards dealt. What is typed in its field is kept as it is typed, so a count can be typed over
 * and the kit can say a count outside its limits is refused. Every count is required, so a blank
 * one shows its error too. The kit says the field's name before the error, so the error's own words
 * name neither the player nor what is counted.
 */
const Count = ({
    id,
    name,
    what,
    detail,
    text,
    max,
    off,
    onText,
    pressWords,
}: {
    readonly id: string;
    readonly name: string;
    readonly what: 'bid' | 'tricks';
    /** What sits after the name in the label, such as the player's bid beside their tricks. */
    readonly detail: string;
    readonly text: string;
    readonly max: number;
    readonly off: boolean;
    readonly onText: (text: string) => void;
    /** The page's words said after the value of each press, read as the press is said. */
    readonly pressWords?: (() => string) | undefined;
}) => {
    const field = useRef<HTMLInputElement>(null);
    // The label read is the label shown with what is counted after it, in one piece out of sight,
    // since a browser puts a space before a piece out of sight that follows the words shown.
    const seen = detail === '' ? name : `${name} ${detail}`;
    // The stepper says its presses on the screen's status line, with the page's words after the
    // value in one message, and describes its own range.
    const say = useStatus();
    const words = useRef(pressWords);
    useEffect(() => {
        words.current = pressWords;
    });
    useEffect(
        () =>
            field.current === null
                ? undefined
                : attachStepper(field.current, { say, words: () => words.current?.() ?? '' }),
        [say]
    );
    return (
        <StepperField
            ref={field}
            id={id}
            inline
            tall
            label={
                <>
                    <span aria-hidden="true">
                        {name}
                        {detail === '' ? null : (
                            <>
                                {' '}
                                <span className="dk-note">{detail}</span>
                            </>
                        )}
                    </span>
                    <span className="dk-visually-hidden">{`${seen}, ${what === 'bid' ? 'bid' : 'tricks taken'}`}</span>
                </>
            }
            subject={`${name}'s ${what}`}
            required
            min={0}
            max={max}
            value={text}
            rangeError={`Enter a number from 0 to ${String(max)}.`}
            onChange={(event) => {
                // A press while the round is saving is let go, as every key's is.
                if (!off) onText(event.currentTarget.value);
            }}
        />
    );
};

/**
 * Who is out of the round, with a way to put each back, and a way to skip each player still in it,
 * while the round keeps two. The list of players to skip closes once a skip is kept, and otherwise
 * gives focus back to the button that opened it.
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
    readonly onSkip: (player: string) => Promise<boolean>;
    readonly onBack: (player: string) => void;
    /** What shares the first row, such as the way back to the bids. */
    readonly extra?: ReactNode;
}) => {
    // The way to skip each player opens from one button, so the keys keep their place on a phone.
    const [open, setOpen] = useState(false);
    const focusAfterDraw = useFocusAfterDraw();
    const skip = async (one: string) => {
        if (await onSkip(one)) setOpen(false);
        else focusAfterDraw('skip-player');
    };
    return (
        <>
            {skippable || extra !== undefined ? (
                <p className="dk-actions dk-note">
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
                                        onClick={() => void skip(one)}
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
                <p className="dk-actions dk-note">
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

/** A count as typed, read as a whole number from nothing to the most, or null where it is not one. */
export const countIn = (text: string, most: number): number | null => {
    if (!/^\d+$/.test(text)) return null;
    const count = Number(text);
    return count <= most ? count : null;
};

/**
 * What each player bid or took, as typed or set on the steppers, started again from what is kept
 * as the round reaches each moment: a bid, or nothing, and tricks, or the bid, so a made bid costs
 * no taps. A player skipped or put back leaves every other player's count as it was set.
 */
const useCounts = (game: GameWithDraft, playing: readonly string[], phase: Phase) => {
    const { draft } = game;
    const dealt = draft.index + 1;
    const keptOfPlayer = (one: string): string => {
        const { bid, tricks } = countsOf(draft.round.entries[one]);
        return String(phase === 'bids' ? (bid ?? 0) : (tricks ?? bid ?? 0));
    };
    const moment = `${String(draft.index)}|${phase}`;
    const [counts, setCounts] = useState<{
        readonly moment: string;
        readonly texts: Readonly<Record<string, string>>;
    }>(() => ({ moment, texts: {} }));
    const shown = counts.moment === moment ? counts : { moment, texts: {} };
    if (shown !== counts) setCounts(shown);
    const textOf = (one: string) => shown.texts[one] ?? keptOfPlayer(one);
    const countOf = (one: string) => countIn(textOf(one), dealt);
    /** The texts with one player's changed, for every player in the round. */
    const withText = (one: string, text: string) =>
        Object.fromEntries(playing.map((each) => [each, each === one ? text : textOf(each)]));
    const set = (one: string, text: string) => {
        setCounts((now) => ({ ...now, texts: { ...now.texts, [one]: text } }));
    };
    return { textOf, countOf, withText, set };
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
    countOf,
}: {
    readonly playing: readonly string[];
    readonly names: ReadonlyMap<string, string>;
    readonly dealer: string | null;
    readonly countOf: (player: string) => number | null;
}) => (
    <section className="dk-stack dk-stack-heading gtt-keys" aria-labelledby="hand-title">
        <h3 id="hand-title" className="dk-eyebrow">
            The bids, while the hand is played
        </h3>
        <ul className="gtt-bids" role="list">
            {playing.map((one) => (
                <li key={one}>
                    <span className="gtt-bid-name">
                        {nameIn(names, one)}
                        {one === dealer ? (
                            <>
                                {' '}
                                <span className="dk-note">deals</span>
                            </>
                        ) : null}
                    </span>
                    <span className="dk-numeral">
                        <span className="dk-visually-hidden">, bid </span>
                        {countOf(one) ?? 0}
                    </span>
                </li>
            ))}
        </ul>
    </section>
);

/**
 * Every player's bid, or their tricks, on a stepper each, under a line that says what they add
 * up to, and why the round cannot move on where a count typed is not one.
 */
const CountsView = ({
    game,
    playing,
    names,
    dealer,
    what,
    off,
    counts,
    left,
    wrong,
    onText,
    pressWords,
}: {
    readonly game: GameWithDraft;
    readonly playing: readonly string[];
    readonly names: ReadonlyMap<string, string>;
    readonly dealer: string | null;
    readonly what: 'bid' | 'tricks';
    readonly off: boolean;
    readonly counts: ReturnType<typeof useCounts>;
    /** The tricks still to enter, in words. */
    readonly left: string;
    /** Why a count typed is refused, in words, or an empty string. */
    readonly wrong: string;
    readonly onText: (player: string, text: string) => void;
    /** The words said after each press's value, the tricks still to enter. */
    readonly pressWords?: (() => string) | undefined;
}) => {
    const { draft } = game;
    const dealt = draft.index + 1;
    const given = playing.reduce((sum, one) => sum + (counts.countOf(one) ?? 0), 0);
    // The bid beside each player's tricks, and who deals beside the bids.
    const detailOf = (one: string) => {
        if (what === 'tricks') return `bid ${String(countsOf(draft.round.entries[one]).bid ?? 0)}`;
        return one === dealer ? 'deals' : '';
    };
    return (
        <section
            className="dk-stack dk-stack-heading gtt-keys"
            aria-label={what === 'bid' ? 'Bids' : 'Tricks taken'}
        >
            {what === 'tricks' ? (
                <p className="dk-field-hint" id="tricks-left" tabIndex={-1}>
                    {left}
                </p>
            ) : (
                <p className="dk-field-hint" id="counts-line" tabIndex={-1}>
                    The bids come to {given} for {dealt} {dealt === 1 ? 'card' : 'cards'} each.
                </p>
            )}
            {wrong === '' ? null : (
                <p className="dk-field-hint" id="counts-why">
                    {wrong}
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
                        text={counts.textOf(one)}
                        max={dealt}
                        off={off}
                        onText={(text) => {
                            onText(one, text);
                        }}
                        pressWords={pressWords}
                    />
                ))}
            </div>
        </section>
    );
};

/** How long a run of presses rests before the tricks still to enter are said, in milliseconds. */
const SETTLE = 700;

/**
 * A round of Wizard being entered, at whichever of its moments it is: the bids, the hand, or the
 * tricks. Each moment keeps the round's title, its way to skip a player, and its dock. Every count
 * is kept as it is set, so a page loaded again and an Undo of the saved round come back to them.
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
    const round = draft.index + 1;
    const dealer = dealerOf(players, draft.round, draft.index);
    const actionsOf = useRound({ play, game, names, summary, lineOf: wizardLines(names) });
    const { busy, changing, say, focusOn } = actionsOf;
    // The table says the hand is over by asking for the tricks, which is kept for this round only.
    const [over, setOver] = useState<number | null>(null);
    const phase = phaseOf(game, playing, changing || over === draft.index);
    const counts = useCounts(game, playing, phase);
    const what = phase === 'bids' ? 'bid' : 'tricks';
    const given = playing.reduce((sum, one) => sum + (counts.countOf(one) ?? 0), 0);
    const left = tricksLeftWords(given, dealt);
    const refusedBy = playing.find((one) => counts.countOf(one) === null);
    const wrong =
        refusedBy === undefined || phase === 'hand'
            ? ''
            : `${nameOf(refusedBy)}'s ${what === 'bid' ? 'bid' : 'tricks'} can be from 0 to ${String(dealt)}.`;

    // The tricks still to enter, as last said, so the same words are not said again. A press says
    // them with its value, in the stepper's own message, and a count typed says them once the
    // typing rests, as the status line lets words settle. Words not yet said by then are let go
    // where the tricks change again, the round moves to another step or the screen goes, and the
    // words are marked said only as they are put on the line, so words the line dropped are said
    // with the next change.
    const spoken = useRef(left);
    const leftNow = useRef(left);
    const tricksNow = useRef(phase === 'tricks');
    useEffect(() => {
        leftNow.current = left;
        tricksNow.current = phase === 'tricks';
    });
    const pressWords = () => {
        if (!tricksNow.current) return '';
        spoken.current = leftNow.current;
        return leftNow.current;
    };
    useEffect(() => {
        if (phase !== 'tricks' || spoken.current === left) return undefined;
        let live = true;
        say(
            () => {
                if (!live || spoken.current === left) return null;
                spoken.current = left;
                return left;
            },
            { settle: SETTLE }
        );
        return () => {
            live = false;
        };
    }, [left, phase, say]);
    const sayInstead = (words: string, after: string) => {
        spoken.current = after;
        say(words);
    };

    const valuesOf = (texts: Readonly<Record<string, string>>): StepValue[] | null => {
        const values = playing.map((one) => ({
            step: { part: what, player: one } as const,
            value: countIn(texts[one] ?? '', dealt),
        }));
        return values.every(({ value }) => value !== null) ? values : null;
    };

    /** Sets a player's count as typed, and keeps every count once each is one. */
    const change = (one: string, text: string) => {
        if (actionsOf.held()) return;
        summary.clear();
        counts.set(one, text);
        const values = valuesOf(counts.withText(one, text));
        if (values !== null) void play.holdAll(id, values);
    };

    const saveBids = async () => {
        const values = valuesOf(counts.withText('', ''));
        if (values === null) return;
        const done = await actionsOf.run(
            () => play.enterAll(id, values),
            'The bids could not be saved.',
            { moves: true }
        );
        if (!done) return;
        const bids = playing.map((one) => `${nameOf(one)} ${String(counts.countOf(one) ?? 0)}`);
        summary.offer(`The bids for round ${String(round)} are in: ${listOf(bids, 'and')}.`);
    };

    const saveTricks = async () => {
        const values = valuesOf(counts.withText('', ''));
        if (values === null || given !== dealt) return;
        await actionsOf.run(
            () => actionsOf.saveRound(wizardRefusalWords, undefined, { values }),
            'The round could not be saved.',
            { moves: true }
        );
    };

    const enterTricks = () => {
        summary.clear();
        setOver(draft.index);
        sayInstead(`Enter the tricks for round ${String(round)}. ${left}`, left);
        focusOn('tricks-left');
    };

    const skip = async (one: string): Promise<boolean> => {
        const done = await actionsOf.run(
            () => play.setOut(id, [...draft.round.out, one]),
            'The player could not be skipped.'
        );
        if (!done) return false;
        const after = dealerOf(
            players,
            { ...draft.round, out: [...draft.round.out, one] },
            draft.index
        );
        const deals = after !== null && after !== dealer ? ` ${nameOf(after)} deals instead.` : '';
        sayInstead(
            `${skipWords(nameOf(one), draft.index, totalBefore(game, one, draft.index))}${deals}`,
            left
        );
        focusOn(`put-back-${one}`);
        return true;
    };

    // A player put back has no bid, so the round goes back to the bids, which are kept as set.
    const back = async (one: string) => {
        // The round's own words for a put back are left unsaid, since these say the bid to set.
        await actionsOf.back('', one, { focus: false, quiet: true });
        const step = keptOf(play, id)?.draft?.step;
        if (step?.part === 'tricks') await actionsOf.goTo({ part: 'bid', player: one });
        setOver(null);
        sayInstead(
            `${nameOf(one)} is back in round ${String(round)}. Set ${nameOf(one)}'s bid.`,
            left
        );
        focusOn('counts-line');
    };

    const changeBids = async () => {
        const first = playing[0];
        if (first === undefined) return;
        setOver(null);
        if (!(await actionsOf.goTo({ part: 'bid', player: first }))) return;
        sayInstead(`Change the bids for round ${String(round)}.`, left);
        focusOn('counts-line');
    };

    const below = (
        <OutRows
            playing={playing}
            out={draft.round.out}
            names={names}
            skippable={canSkip(players, draft.round)}
            off={busy}
            onSkip={skip}
            onBack={(one) => void back(one)}
            extra={
                phase === 'bids' || changing ? undefined : (
                    <Button text off={busy} onClick={() => void changeBids()}>
                        Change the bids
                    </Button>
                )
            }
        />
    );
    const parts = { playing, names, dealer };
    const refused = wrong !== '' || (phase === 'tricks' && given !== dealt);

    return (
        <div className="gtt-game gtt-wizard">
            <div className="dk-stack dk-stack-heading">
                {changing ? null : actions}
                <RoundTitle
                    index={draft.index}
                    rounds={wizardRounds(players.length)}
                    dealer={dealer === null ? null : nameOf(dealer)}
                />
                {below}
            </div>
            {phase === 'hand' ? (
                <HandView {...parts} countOf={counts.countOf} />
            ) : (
                <CountsView
                    {...parts}
                    game={game}
                    what={what}
                    off={busy}
                    counts={counts}
                    left={left}
                    wrong={wrong}
                    onText={change}
                    pressWords={pressWords}
                />
            )}
            <Failure words={game.error} />
            <RoundDock
                id={id}
                index={draft.index}
                changing={changing}
                off={busy}
                moving={actionsOf.moving}
                refused={refused}
                why={wrong === '' ? 'tricks-left' : 'counts-why'}
                label={labelOf(phase, changing, draft.index)}
                onNext={() => {
                    if (phase === 'bids') void saveBids();
                    else if (phase === 'hand') enterTricks();
                    else void saveTricks();
                }}
                onCancel={() => void actionsOf.cancel()}
            />
        </div>
    );
};
