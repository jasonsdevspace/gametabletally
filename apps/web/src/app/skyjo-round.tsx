import type { Problem } from '@gametabletally/scoring';
import {
    Button,
    ChoiceField,
    useFocusAfterDraw,
    useRoving,
} from '@jasonsdevspace/design-kit/react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

import { type Play, previewWith, stepAfter } from '../play/play.js';
import { type DraftRound, playingIn } from '../play/steps.js';
import { isRecord, type SavedStep } from '../store/format.js';
import { listOf } from '../website/games.js';
import { Failure } from './failure.js';
import { nameIn } from './opened-game.js';
import {
    canSkip,
    type GameWithDraft,
    nextLabel,
    outWords,
    RoundDock,
    SkipRows,
    totalBefore,
    useRound,
} from './round.js';
import type { RoundLine } from './round-summary.js';
import { drawnOf, ScoreHeader, spokenOf } from './ScoreHeader.js';
import type { Summary } from './summary.js';

/*
 * A round of Skyjo being entered. Players count their own cards, so each types the total they
 * counted on a number pad, or taps their cards in on a pad of the card values and lets the app add
 * them up, from a strip where a tapped card can be taken out again. A total has to be in before
 * the turn moves on, since a total of nothing would be the best score there is. Once every total
 * is in, the round asks who ended it, among the players who played it, and the rules double that
 * player's score where it was not the lowest alone, which the round's summary says in words.
 */

/** The card values, from minus two to twelve. */
const CARDS = Array.from({ length: 15 }, (_, at) => at - 2);

/** The most digits a total takes, since no hand comes to more than three. */
const DIGITS = 3;

/** The keys of the number pad, in the order they are laid out. */
const PAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'minus', '0', 'delete'] as const;

/** The most cards a hand holds, in a grid of four columns of three that never gains one. */
const MOST_CARDS = 12;

/** A key of the number pad. */
type PadKey = (typeof PAD)[number];

/** The key of the number pad a key of a keyboard types, or null for one it does not. */
export const padKeyOf = (key: string): PadKey | null => {
    if (key === '-') return 'minus';
    if (key === 'Backspace' || key === 'Delete') return 'delete';
    return PAD.find((one) => one === key && /^\d$/.test(one)) ?? null;
};

/** How a player's total is being entered: typed, or added up from the cards tapped in. */
export interface SkyjoInput {
    readonly mode: 'total' | 'cards';
    /** The total as typed, a minus sign included. */
    readonly typed: string;
    readonly cards: readonly number[];
}

const EMPTY: SkyjoInput = { mode: 'total', typed: '', cards: [] };

/** How an entry the round holds is entered again: as its total, or as its cards. */
export const inputOf = (entry: unknown): SkyjoInput => {
    if (!isRecord(entry)) return EMPTY;
    const { total, cards } = entry;
    if (Array.isArray(cards))
        return {
            mode: 'cards',
            typed: '',
            cards: cards.filter((card): card is number => typeof card === 'number'),
        };
    return typeof total === 'number' ? { ...EMPTY, typed: String(total) } : EMPTY;
};

/**
 * The entry a player's input makes, or nothing where it holds no total yet: a minus sign alone,
 * or no cards.
 */
export const entryOf = ({ mode, typed, cards }: SkyjoInput): unknown => {
    if (mode === 'cards') return cards.length === 0 ? undefined : { cards: [...cards] };
    return typed === '' || typed === '-' ? undefined : { total: Number(typed) };
};

/** What a player holds by an entry, the total or the cards added up, or nothing where there is none. */
export const heldOf = (entry: unknown): number | undefined => {
    if (!isRecord(entry)) return undefined;
    const { mode, typed, cards } = inputOf(entry);
    if (mode === 'cards') return sumOf(cards);
    return typed === '' ? undefined : Number(typed);
};

/** What cards come to, added up. */
const sumOf = (cards: readonly number[]): number => cards.reduce((sum, card) => sum + card, 0);

/** The input after a key of the number pad is pressed. */
export const pressed = (typed: string, key: PadKey): string => {
    if (key === 'delete') return typed.slice(0, -1);
    if (key === 'minus') return typed.startsWith('-') ? typed.slice(1) : `-${typed}`;
    const digits = typed.replace('-', '');
    if (digits.length >= DIGITS) return typed;
    // A leading zero is replaced, so a typed 0 then 5 is 5.
    return digits === '0' ? `${typed.slice(0, -1)}${key}` : `${typed}${key}`;
};

/** A card's value drawn with its spoken name, so a screen reader says "minus 2" for −2. */
const CardFace = ({ card }: { readonly card: number }) =>
    card < 0 ? (
        <>
            <span aria-hidden="true">{drawnOf(card)}</span>
            <span className="dk-visually-hidden">{spokenOf(card)}</span>
        </>
    ) : (
        <>{card}</>
    );

/**
 * What the rules refuse in a Skyjo entry, in the screen's own words, from the problem's code and
 * data. A code the screen cannot meet is worded by the package's own sentence.
 */
export const skyjoRefusalWords = (problem: Problem): string => {
    const { code, data } = problem;
    if (code === 'impossible-total')
        return `No hand comes to ${String(data.given)}. A total is from ${String(data.min)} to ${String(data.max)}.`;
    if (code === 'too-many-cards')
        return `A hand holds ${String(data.max)} cards at most. Take one out.`;
    if (code === 'too-many-copies')
        return `The deck holds ${String(data.max)} of the ${String(data.card)}, so a hand holds no more. Take one out.`;
    if (code === 'no-ender') return 'Say who ended the round to save it.';
    return problem.message;
};

/**
 * What the rules did to a player's score in a round of Skyjo, in words: doubled for ending the
 * round without the lowest score alone, or that they ended it, or nothing.
 */
export const skyjoNote = (held: number | undefined, score: number | undefined, ender: boolean) => {
    if (held !== undefined && score !== undefined && score !== held)
        return `doubled from ${String(held)}, for ending the round without the lowest score alone`;
    return ender ? 'ended the round' : '';
};

/**
 * Each player's line of a round of Skyjo for the toast, from the round as kept and the score the
 * rules gave it, with what they hold where the rules gave none yet.
 */
const skyjoLines =
    (names: ReadonlyMap<string, string>) =>
    (player: string, round: DraftRound, score: number | undefined, out: boolean): RoundLine => {
        const name = nameIn(names, player);
        if (out) return { name, out };
        const held = heldOf(round.entries[player]);
        const given = score ?? held;
        return {
            name,
            ...(given === undefined ? {} : { score: given }),
            note: skyjoNote(held, score, round['ender'] === player),
        };
    };

/** How a player's total adds up, in a sentence, with the round as it stands. */
export const skyjoLineOf = ({
    before,
    held,
    first,
}: {
    readonly before: number;
    readonly held: number | undefined;
    readonly first: boolean;
}): string => {
    if (held === undefined)
        return first ? 'Nothing this round yet.' : `${String(before)} before this round.`;
    return first
        ? `${String(held)} this round.`
        : `${String(before)} before this round, and ${String(held)} this round.`;
};

/** What a pad of keys takes from the keys that hold it. */
interface PadParts {
    readonly input: SkyjoInput;
    readonly off: boolean;
    readonly describedBy: string | undefined;
    /** What starts the pad's stop again at its first key, as for the next player. */
    readonly fresh: string;
    readonly set: (input: SkyjoInput) => void;
}

/**
 * The number pad a total is typed on, one stop for the Tab key, which also takes the digits, a
 * minus sign and Backspace typed on a keyboard.
 */
const NumberPad = ({ input, off, describedBy, fresh, set }: PadParts) => {
    const pad = useRoving<HTMLDivElement>();
    return (
        // Drawn afresh for each player, so the pad's stop starts at its first key.
        <div
            key={fresh}
            ref={pad}
            className="dk-button-grid gtt-pad"
            role="group"
            aria-label="Number pad"
            aria-describedby={describedBy}
            onKeyDown={(event) => {
                // The arrow keys, Home and End are the kit's, which it marks as handled.
                const key =
                    event.altKey || event.ctrlKey || event.metaKey ? null : padKeyOf(event.key);
                if (key === null || event.defaultPrevented) return;
                event.preventDefault();
                set({ ...input, typed: pressed(input.typed, key) });
            }}
        >
            {PAD.map((key) => (
                <Button
                    key={key}
                    {...(key === 'minus' ? { pressed: input.typed.startsWith('-') } : {})}
                    off={off || (key === 'delete' && input.typed === '')}
                    onClick={() => {
                        set({ ...input, typed: pressed(input.typed, key) });
                    }}
                >
                    {key === 'minus' ? 'Minus' : key === 'delete' ? 'Delete' : key}
                </Button>
            ))}
        </div>
    );
};

/**
 * The cards a total is added up from: the strip of cards tapped in, each a key that takes it out
 * again, then the pad of card values, each one stop for the Tab key. The keys stand at the foot of
 * the screen, so a row of cards tapped in takes its room from above and leaves the pad where it is.
 * A card taken out leaves focus on the card that takes its place in the strip, or on the one before
 * it after the last, or on the pad once the strip is empty.
 */
const CardPad = ({ input, off, describedBy, fresh, set }: PadParts) => {
    const { cards } = input;
    const pad = useRoving<HTMLDivElement>();
    const strip = useRoving<HTMLDivElement>();
    const full = cards.length >= MOST_CARDS;
    const stripRef = useRef<HTMLDivElement>(null);
    const padRef = useRef<HTMLDivElement>(null);
    // Each grid's ref holds it for the focus below and attaches it to the kit's keys, the same
    // across renders, so a press that draws the grid again keeps its stop where it is.
    const stripAt = useCallback(
        (element: HTMLDivElement | null) => {
            stripRef.current = element;
            return strip(element);
        },
        [strip]
    );
    const padAt = useCallback(
        (element: HTMLDivElement | null) => {
            padRef.current = element;
            return pad(element);
        },
        [pad]
    );
    // Where focus goes once a card taken out is drawn, by its place in the strip, or the pad's stop
    // once the strip is empty.
    const focusAfterDraw = useFocusAfterDraw();
    const focusAt = (at: number) => {
        focusAfterDraw(
            () => {
                const chips = stripRef.current?.querySelectorAll(':scope > button');
                return chips?.[Math.min(at, chips.length - 1)] ?? null;
            },
            { fallbacks: [() => padRef.current?.querySelector('[tabindex="0"]') ?? null] }
        );
    };
    const hints = [describedBy, full ? 'cards-full' : null].filter(Boolean).join(' ');
    return (
        <>
            {cards.length === 0 ? null : (
                <div
                    key={`strip|${fresh}`}
                    ref={stripAt}
                    className="dk-button-grid gtt-strip"
                    role="group"
                    aria-label={`Cards tapped in, ${spokenOf(sumOf(cards))} in all`}
                >
                    {cards.map((card, at) => (
                        <Button
                            // Known by place, so the card that takes a taken card's place keeps
                            // its key, and focus with it.
                            key={at}
                            off={off}
                            onClick={() => {
                                if (off) return;
                                set({ ...input, cards: cards.filter((_, place) => place !== at) });
                                focusAt(at);
                            }}
                        >
                            <span aria-hidden="true">{drawnOf(card)}</span>
                            <span aria-hidden="true" className="gtt-take-out">
                                ×
                            </span>
                            <span className="dk-visually-hidden">Take out {spokenOf(card)}</span>
                        </Button>
                    ))}
                </div>
            )}
            {cards.length === 0 ? (
                <p className="dk-field-hint">Tap each card your hand holds.</p>
            ) : null}
            <div
                key={`cards|${fresh}`}
                ref={padAt}
                className="dk-button-grid gtt-cards"
                role="group"
                aria-label="Cards"
                aria-describedby={hints === '' ? undefined : hints}
            >
                {CARDS.map((card) => (
                    <Button
                        key={card}
                        off={full || off}
                        onClick={() => {
                            if (!full && !off) set({ ...input, cards: [...cards, card] });
                        }}
                    >
                        <CardFace card={card} />
                    </Button>
                ))}
            </div>
            {full ? (
                <p className="dk-field-hint" id="cards-full">
                    A hand holds {MOST_CARDS} cards at most. Take one out to add another.
                </p>
            ) : null}
        </>
    );
};

/** The ways a total is entered, as the tabs over the keys name them. */
const MODES = [
    { mode: 'total', label: 'Type a total' },
    { mode: 'cards', label: 'Add it up for me' },
] as const;

/**
 * The keys a Skyjo total is entered with: tabs for typing it or adding up the cards, one stop for
 * the Tab key with the arrow keys choosing between them, then the panel they choose, the number pad
 * or the strip of cards tapped in above the pad of card values, then what the rules refuse in it,
 * or what it needs before the turn moves on. Choosing a way keeps what was entered the other way.
 */
export const SkyjoKeys = ({
    name,
    input,
    why,
    off = false,
    onChange,
    onMode,
}: {
    readonly name: string;
    readonly input: SkyjoInput;
    /** What the rules refuse in the entry, in words, or an empty string. */
    readonly why: string;
    readonly off?: boolean;
    readonly onChange: (input: SkyjoInput) => void;
    readonly onMode: (mode: SkyjoInput['mode']) => void;
}) => {
    const tabs = useRoving<HTMLDivElement>();
    const empty = entryOf(input) === undefined;
    const ids = [why === '' ? null : 'hand-why', empty ? 'entry-hint' : null].filter(Boolean);
    const describedBy = ids.length === 0 ? undefined : ids.join(' ');
    const set = (next: SkyjoInput) => {
        if (!off) onChange(next);
    };
    const choose = (mode: SkyjoInput['mode']) => {
        if (!off && mode !== input.mode) onMode(mode);
    };
    const parts = { input, off, describedBy, fresh: name, set };
    return (
        <section className="dk-stack dk-stack-heading gtt-keys" aria-label={`${name}'s total`}>
            <div
                className="dk-tabs gtt-modes"
                role="tablist"
                ref={tabs}
                aria-label={`How to enter ${name}'s total`}
            >
                {MODES.map(({ mode, label }) => (
                    <button
                        key={mode}
                        type="button"
                        role="tab"
                        id={`mode-${mode}`}
                        className="dk-tab"
                        aria-selected={input.mode === mode}
                        aria-controls="skyjo-entry"
                        aria-disabled={off || undefined}
                        // A tab is chosen as focus reaches it, since choosing keeps both ways.
                        onFocus={() => {
                            choose(mode);
                        }}
                        onClick={() => {
                            choose(mode);
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <div
                className="dk-stack dk-stack-heading gtt-keys"
                role="tabpanel"
                id="skyjo-entry"
                aria-labelledby={`mode-${input.mode}`}
            >
                {input.mode === 'cards' ? <CardPad {...parts} /> : <NumberPad {...parts} />}
                {why === '' ? null : (
                    <div className="dk-field-hint" id="hand-why">
                        {why}
                    </div>
                )}
                {empty ? (
                    <div className="dk-field-hint" id="entry-hint">
                        {input.mode === 'cards'
                            ? `Tap ${name}'s cards in to go on.`
                            : `Type ${name}'s total to go on.`}
                    </div>
                ) : null}
            </div>
        </section>
    );
};

/** The first problem the rules find in a player's entry of a round, or none. */
const problemFor = (preview: ReturnType<typeof previewWith>, index: number, player: string) =>
    preview?.problems.find((one) => one.round === index && one.player === player);

/**
 * A player's input as pressed, which runs ahead of what is kept while a save takes, judged at once
 * by the rules over the round as pressed, so a total the rules refuse is caught before the save of
 * it lands, and the last total the rules took, which the header keeps showing while one is refused,
 * so a refusal is said once, beside the pad, and never reads as a total of nothing. Each starts
 * again from what is kept at each turn.
 */
const useEntry = (game: GameWithDraft, player: string) => {
    const { draft } = game;
    const turn = `${String(draft.index)}|${player}`;
    const fresh = () => {
        const input = inputOf(draft.round.entries[player]);
        return { turn, input, taken: heldOf(entryOf(input)) };
    };
    const [state, setState] = useState(fresh);
    let shown = state.turn === turn ? state : fresh();
    const entry = entryOf(shown.input);
    const problem =
        entry === undefined ? undefined : problemFor(previewWith(game, entry), draft.index, player);
    const taken = entry === undefined ? undefined : problem ? shown.taken : heldOf(entry);
    if (taken !== shown.taken) shown = { ...shown, taken };
    if (shown !== state) setState(shown);
    const setInput = (change: (input: SkyjoInput) => SkyjoInput) => {
        setState((now) => ({ ...now, input: change(now.input) }));
    };
    return {
        input: shown.input,
        entry,
        why: problem ? skyjoRefusalWords(problem) : '',
        taken,
        setInput,
    };
};

/**
 * A player's total in a round of Skyjo being entered. It stays on the page from player to player,
 * so the button for the next player keeps focus as the turn moves on. What was pressed is judged
 * at once, by the rules over the round as pressed, so a total the rules refuse is caught before the
 * save of it lands. A player come back to from who ended the round has focus put on their keys.
 */
export const SkyjoRound = ({
    play,
    game,
    player,
    names,
    summary,
    actions,
    arrived = false,
}: {
    readonly play: Play;
    readonly game: GameWithDraft;
    readonly player: string;
    readonly names: ReadonlyMap<string, string>;
    readonly summary: Summary;
    readonly actions: ReactNode;
    /** Whether the round has just come back to this player from who ended it. */
    readonly arrived?: boolean;
}) => {
    const { draft } = game;
    const id = game.saved.id;
    const nameOf = (one: string) => nameIn(names, one);
    const name = nameOf(player);
    const before = totalBefore(game, player, draft.index);
    const { input, entry, why, taken, setInput } = useEntry(game, player);
    // With nothing entered, the step after is read as if a total were, so the label names it.
    const following = stepAfter(game, entry ?? { total: 0 });
    const actionsOf = useRound({ play, game, names, summary, lineOf: skyjoLines(names) });
    const { busy, changing, say } = actionsOf;
    const focusAfterDraw = useFocusAfterDraw();
    useEffect(() => {
        if (why !== '') say(why);
    }, [why, say]);
    // Come back from who ended the round, focus goes to the player's keys, with why it is there.
    useEffect(() => {
        if (!arrived) return;
        focusAfterDraw(() => document.querySelector('#skyjo-entry [tabindex="0"]'));
        const held = heldOf(draft.round.entries[player]);
        say(
            held === undefined
                ? `Change ${name}'s total.`
                : `Change ${name}'s total. It is ${spokenOf(held)}.`
        );
        // Said once, as the player is come back to.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    }, []);

    const change = (next: SkyjoInput) => {
        if (actionsOf.held()) return;
        summary.clear();
        setInput(() => next);
        void play.hold(id, entryOf(next));
    };
    // A change of the way a total is entered changes nothing kept, so the last Undo stays.
    const choose = (mode: SkyjoInput['mode']) => {
        setInput((now) => ({ ...now, mode }));
    };

    const finishes = following === null && !changing;
    const refused = why !== '' || entry === undefined;

    return (
        <div className="gtt-game">
            <div className="dk-stack dk-stack-heading">
                {changing ? null : actions}
                <ScoreHeader
                    name={name}
                    total={before + (taken ?? 0)}
                    line={skyjoLineOf({ before, held: taken, first: draft.index === 0 })}
                    round={taken ?? null}
                    next={entry === undefined ? `Type ${name}'s total on the pad.` : undefined}
                />
                <SkipRows
                    name={name}
                    out={draft.round.out.map((one) => ({ player: one, name: nameOf(one) }))}
                    skippable={canSkip(game.saved.players, draft.round)}
                    last={finishes}
                    off={busy}
                    onSkip={() => void actionsOf.skip(player, before, finishes, skyjoRefusalWords)}
                    onBack={(who) => void actionsOf.back(player, who)}
                />
            </div>
            <SkyjoKeys
                name={name}
                input={input}
                why={why}
                off={busy}
                onChange={change}
                onMode={choose}
            />
            <Failure words={game.error} />
            <RoundDock
                id={id}
                index={draft.index}
                changing={changing}
                off={busy}
                refused={refused}
                why={why === '' ? 'entry-hint' : 'hand-why'}
                label={nextLabel(following, names, draft.index, changing)}
                onNext={() => {
                    if (!refused) void actionsOf.next(entry, skyjoRefusalWords);
                }}
                onCancel={() => void actionsOf.cancel()}
            />
        </div>
    );
};

/** What naming a player as ender comes to, in a sentence, from the round scored with them named. */
const enderWords = (
    names: ReadonlyMap<string, string>,
    {
        chosen,
        held,
        score,
        beaten,
    }: { chosen: string; held: number; score: number | undefined; beaten: readonly string[] }
): string => {
    const name = nameIn(names, chosen);
    if (score === undefined || score === held) return `${name} keeps ${spokenOf(held)}.`;
    const others = beaten.map((one) => nameIn(names, one));
    return `${name}'s ${spokenOf(held)} doubles to ${spokenOf(score)}, since ${listOf(others, 'and')} ${others.length === 1 ? 'has' : 'have'} as little or less.`;
};

/**
 * Who ended a round of Skyjo, asked once every total is in, among the players who played it, each
 * with what they hold. The choice is kept as it is made, and what the rules make of it, a doubled
 * score or none, is shown under the choices and said as it is made, before the round is saved. Who
 * is out of the round is said as the question is reached, with a way to put each back, and a way
 * goes back to the last player's total.
 */
export const SkyjoEnder = ({
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
    const nameOf = (one: string) => nameIn(names, one);
    const playing = playingIn(game.saved.players, draft.round);
    const out = draft.round.out;
    const kept = draft.round['ender'];
    const [chosen, setChosen] = useState<string | null>(
        typeof kept === 'string' && playing.includes(kept) ? kept : null
    );
    const actionsOf = useRound({ play, game, names, summary, lineOf: skyjoLines(names) });
    const { busy, changing, say } = actionsOf;
    const focusAfterDraw = useFocusAfterDraw();
    const heldBy = (one: string) => heldOf(draft.round.entries[one]) ?? 0;

    /** What naming a player comes to, by the rules over the round with them named. */
    const outcomeOf = (one: string) =>
        enderWords(names, {
            chosen: one,
            held: heldBy(one),
            score: previewWith(game, one)?.rounds[draft.index]?.scores[one],
            beaten: playing.filter((other) => other !== one && heldBy(other) <= heldBy(one)),
        });

    // Focus moves into the question as it is drawn, at the choice made or the first one, and who
    // is out of the round is said, since a skip that brought the round here was said nowhere else.
    const field = useRef<HTMLFieldSetElement>(null);
    useEffect(() => {
        focusAfterDraw(() => {
            const radios = field.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]');
            return [...(radios ?? [])].find((radio) => radio.checked) ?? radios?.[0] ?? null;
        });
        if (out.length > 0) say(outWords(out.map(nameOf)));
        // Said once, as the question is reached.
        // eslint-disable-next-line react-hooks/exhaustive-deps -- see above
    }, []);

    const choose = (one: string) => {
        if (actionsOf.held()) return;
        summary.clear();
        setChosen(one);
        say(outcomeOf(one));
        void play.hold(id, one);
    };

    // The last player still in the round, whose total is the one to go back to.
    const last = playing.at(-1);
    const following = stepAfter(game, chosen ?? playing[0] ?? null);

    return (
        <div className="gtt-game">
            <div className="dk-stack dk-stack-heading">{changing ? null : actions}</div>
            <ChoiceField
                ref={field}
                label="Who ended the round?"
                hint="The player who turned their last card first. Their score doubles if it is above zero and another player has as little or less."
                name="ender"
                choices={playing.map((one) => ({
                    value: one,
                    label: nameOf(one),
                    hint: `scored ${spokenOf(heldBy(one))}`,
                    checked: chosen === one,
                    disabled: busy,
                    onChange: () => {
                        choose(one);
                    },
                }))}
            />
            {chosen === null ? (
                <p className="dk-field-hint" id="ender-hint">
                    Choose who ended the round to save it.
                </p>
            ) : (
                <p id="ender-outcome">{outcomeOf(chosen)}</p>
            )}
            {out.length === 0 ? null : (
                <p className="dk-actions dk-note">
                    <span>{outWords(out.map(nameOf))}</span>
                    {out.map((one) => (
                        <Button
                            key={one}
                            text
                            off={busy}
                            onClick={() => void actionsOf.back('', one)}
                        >
                            Put {nameOf(one)} back
                        </Button>
                    ))}
                </p>
            )}
            {last === undefined ? null : (
                <p className="dk-actions">
                    <Button
                        text
                        off={busy}
                        onClick={() => {
                            const step: SavedStep = { part: 'entry', player: last };
                            void actionsOf.goTo(step);
                        }}
                    >
                        Change {nameOf(last)}&apos;s total
                    </Button>
                </p>
            )}
            <Failure words={game.error} />
            <RoundDock
                id={id}
                index={draft.index}
                changing={changing}
                off={busy}
                refused={chosen === null}
                why="ender-hint"
                described={chosen === null ? undefined : 'ender-outcome'}
                label={nextLabel(following, names, draft.index, changing)}
                onNext={() => {
                    if (chosen !== null) void actionsOf.next(chosen, skyjoRefusalWords);
                }}
                onCancel={() => void actionsOf.cancel()}
            />
        </div>
    );
};
