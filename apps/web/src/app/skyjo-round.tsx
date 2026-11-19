import type { Problem } from '@gametabletally/scoring';
import { Button, ChoiceField, StatusLine } from '@jasonsdevspace/design-kit/react';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import { type Play, stepAfter } from '../play/play.js';
import { type DraftRound, playingIn } from '../play/steps.js';
import { isRecord } from '../store/format.js';
import { listOf } from '../website/games.js';
import { nameIn } from './opened-game.js';
import {
    canSkip,
    type GameWithDraft,
    nextLabel,
    RoundDock,
    SkipRows,
    totalBefore,
    useRound,
} from './round.js';
import type { RoundLine } from './round-summary.js';
import { useRoving } from './roving.js';
import { ScoreHeader } from './ScoreHeader.js';
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
    if (mode === 'cards') return cards.reduce((sum, card) => sum + card, 0);
    return typed === '' ? undefined : Number(typed);
};

/** The input after a key of the number pad is pressed. */
export const pressed = (typed: string, key: (typeof PAD)[number]): string => {
    if (key === 'delete') return typed.slice(0, -1);
    if (key === 'minus') return typed.startsWith('-') ? typed.slice(1) : `-${typed}`;
    const digits = typed.replace('-', '');
    if (digits.length >= DIGITS) return typed;
    // A leading zero is replaced, so a typed 0 then 5 is 5.
    return digits === '0' ? `${typed.slice(0, -1)}${key}` : `${typed}${key}`;
};

/** A card value as a screen reader says it, with a minus for the cards below zero. */
const spokenCard = (card: number): string => (card < 0 ? `minus ${String(-card)}` : String(card));

/** A card value as drawn, with a true minus sign. */
const drawnCard = (card: number): string => (card < 0 ? `−${String(-card)}` : String(card));

/** A card's value drawn with its spoken name, so a screen reader says "minus 2" for −2. */
const CardFace = ({ card }: { readonly card: number }) =>
    card < 0 ? (
        <>
            <span aria-hidden="true">{drawnCard(card)}</span>
            <span className="dk-visually-hidden">{spokenCard(card)}</span>
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

/** A player's line of a round of Skyjo, from the round as kept and the score the rules gave it. */
const skyjoLine = (
    name: string,
    {
        player,
        round,
        score,
        out,
    }: { player: string; round: DraftRound; score?: number; out: boolean }
): RoundLine => {
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

/** The number pad a total is typed on, one stop for the Tab key. */
const NumberPad = ({
    input,
    off,
    describedBy,
    fresh,
    set,
}: {
    readonly input: SkyjoInput;
    readonly off: boolean;
    readonly describedBy: string | undefined;
    /** What starts the pad's stop again at its first key. */
    readonly fresh: string;
    readonly set: (input: SkyjoInput) => void;
}) => {
    const pad = useRoving(fresh);
    return (
        <div
            className="dk-button-grid gtt-pad"
            role="group"
            aria-label="Number pad"
            aria-describedby={describedBy}
            onFocus={pad.onFocus}
            onClick={pad.onClick}
            onKeyDown={pad.onKeyDown}
        >
            {PAD.map((key, at) => (
                <Button
                    key={key}
                    tabIndex={pad.tabIndexOf(at)}
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
 */
const CardPad = ({
    input,
    off,
    describedBy,
    fresh,
    set,
}: {
    readonly input: SkyjoInput;
    readonly off: boolean;
    readonly describedBy: string | undefined;
    readonly fresh: string;
    readonly set: (input: SkyjoInput) => void;
}) => {
    const pad = useRoving(fresh);
    const strip = useRoving(`${fresh}|strip`);
    const { cards } = input;
    const sum = cards.reduce((total, card) => total + card, 0);
    const full = cards.length >= 12;
    return (
        <>
            {cards.length === 0 ? null : (
                <div
                    className="dk-button-grid gtt-strip"
                    role="group"
                    aria-label={`Cards tapped in, ${String(sum)} in all`}
                    onFocus={strip.onFocus}
                    onClick={strip.onClick}
                    onKeyDown={strip.onKeyDown}
                >
                    {cards.map((card, at) => (
                        <Button
                            // A hand holds a value more than once, so each card is known by its place.
                            key={`${String(at)}|${String(card)}`}
                            tabIndex={strip.tabIndexOf(at)}
                            off={off}
                            onClick={() => {
                                set({ ...input, cards: cards.filter((_, place) => place !== at) });
                            }}
                        >
                            <span aria-hidden="true">{drawnCard(card)}</span>
                            <span aria-hidden="true" className="gtt-take-out">
                                ×
                            </span>
                            <span className="dk-visually-hidden">Take out {spokenCard(card)}</span>
                        </Button>
                    ))}
                </div>
            )}
            {cards.length === 0 ? (
                <p className="dk-field-hint">Tap each card your hand holds.</p>
            ) : null}
            <div
                className="dk-button-grid gtt-cards"
                role="group"
                aria-label="Cards"
                aria-describedby={describedBy}
                onFocus={pad.onFocus}
                onClick={pad.onClick}
                onKeyDown={pad.onKeyDown}
            >
                {CARDS.map((card, at) => (
                    <Button
                        key={card}
                        tabIndex={pad.tabIndexOf(at)}
                        off={full || off}
                        onClick={() => {
                            if (!full) set({ ...input, cards: [...cards, card] });
                        }}
                    >
                        <CardFace card={card} />
                    </Button>
                ))}
            </div>
        </>
    );
};

/**
 * The keys a Skyjo total is entered with: a choice of typing it or adding up the cards, then the
 * number pad, or the strip of cards tapped in above the pad of card values, then what the rules
 * refuse in it, or what it needs before the turn moves on.
 */
export const SkyjoKeys = ({
    name,
    input,
    why,
    off = false,
    onChange,
}: {
    readonly name: string;
    readonly input: SkyjoInput;
    /** What the rules refuse in the entry, in words, or an empty string. */
    readonly why: string;
    readonly off?: boolean;
    readonly onChange: (input: SkyjoInput) => void;
}) => {
    const empty = entryOf(input) === undefined;
    const ids = [why === '' ? null : 'hand-why', empty ? 'entry-hint' : null].filter(Boolean);
    const describedBy = ids.length === 0 ? undefined : ids.join(' ');
    const set = (next: SkyjoInput) => {
        if (!off) onChange(next);
    };
    const mode = (which: SkyjoInput['mode'], label: string) => (
        <button
            type="button"
            className="dk-tab"
            aria-pressed={input.mode === which}
            onClick={() => {
                set({ ...input, mode: which });
            }}
        >
            {label}
        </button>
    );
    const parts = { input, off, describedBy, fresh: name, set };
    return (
        <section className="gtt-keys" aria-label={`${name}'s total`}>
            <div className="dk-tabs gtt-modes" role="group" aria-label="How to enter it">
                {mode('total', 'Type a total')}
                {mode('cards', 'Add it up for me')}
            </div>
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
        </section>
    );
};

/**
 * A player's total in a round of Skyjo being entered. It stays on the page from player to player,
 * so the button for the next player keeps focus as the turn moves on.
 */
export const SkyjoRound = ({
    play,
    game,
    player,
    names,
    summary,
    actions,
}: {
    readonly play: Play;
    readonly game: GameWithDraft;
    readonly player: string;
    readonly names: ReadonlyMap<string, string>;
    readonly summary: Summary;
    readonly actions: ReactNode;
}) => {
    const { draft } = game;
    const id = game.saved.id;
    const nameOf = (one: string) => nameIn(names, one);
    const name = nameOf(player);
    const before = totalBefore(game, player, draft.index);
    const turn = `${String(draft.index)}|${player}`;
    // The input as pressed, which runs ahead of what is kept while a save takes, started again
    // from what is kept at each turn.
    const [state, setState] = useState(() => ({
        turn,
        input: inputOf(draft.round.entries[player]),
    }));
    let shown = state;
    if (state.turn !== turn) shown = { turn, input: inputOf(draft.round.entries[player]) };
    if (shown !== state) setState(shown);
    const { input } = shown;
    const entry = entryOf(input);
    const problem = draft.preview.problems.find(
        (one) => one.round === draft.index && one.player === player
    );
    const why = entry !== undefined && problem ? skyjoRefusalWords(problem) : '';
    // With nothing entered, the step after is read as if a total were, so the label names it.
    const following = stepAfter(game, entry ?? { total: 0 });
    const actionsOf = useRound({
        play,
        game,
        names,
        summary,
        lineOf: (one, kept, score, out) =>
            skyjoLine(nameOf(one), {
                player: one,
                round: kept,
                ...(score === undefined ? {} : { score }),
                out,
            }),
    });
    const { busy, changing, line, say } = actionsOf;
    useEffect(() => {
        if (why !== '') say(why);
    }, [why, say]);

    const change = (next: SkyjoInput) => {
        if (actionsOf.held()) return;
        summary.clear();
        setState((now) => ({ ...now, input: next }));
        void play.hold(id, entryOf(next));
    };

    // A total the rules refuse is said beside the pad and left out of the header's total.
    const held = entry === undefined || why !== '' ? undefined : heldOf(entry);
    const finishes = following === null && !changing;
    const refused = why !== '' || entry === undefined;

    return (
        <div className="gtt-game">
            <div className="gtt-game-top">
                {changing ? null : actions}
                <ScoreHeader
                    name={name}
                    total={before + (held ?? 0)}
                    line={skyjoLineOf({ before, held, first: draft.index === 0 })}
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
            <SkyjoKeys name={name} input={input} why={why} off={busy} onChange={change} />
            <StatusLine ref={line} />
            {game.error === null ? null : <p role="alert">{game.error}</p>}
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

/**
 * Who ended a round of Skyjo, asked once every total is in, among the players who played it, each
 * with what they hold. The choice is kept as it is made, and what the rules make of it, a doubled
 * score or none, is said under the choices before the round is saved.
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
    const kept = draft.round['ender'];
    const [chosen, setChosen] = useState<string | null>(
        typeof kept === 'string' && playing.includes(kept) ? kept : null
    );
    const actionsOf = useRound({
        play,
        game,
        names,
        summary,
        lineOf: (one, round, score, out) =>
            skyjoLine(nameOf(one), {
                player: one,
                round,
                ...(score === undefined ? {} : { score }),
                out,
            }),
    });
    const { busy, changing, line } = actionsOf;
    const scores = draft.preview.rounds[draft.index]?.scores ?? {};
    const heldBy = (one: string) => heldOf(draft.round.entries[one]) ?? 0;

    // Focus moves into the question as it is drawn, at the choice made or the first one.
    const field = useRef<HTMLFieldSetElement>(null);
    useEffect(() => {
        const radios = field.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]');
        const first = [...(radios ?? [])].find((radio) => radio.checked) ?? radios?.[0];
        first?.focus();
    }, []);

    const choose = (one: string) => {
        if (actionsOf.held()) return;
        summary.clear();
        setChosen(one);
        void play.hold(id, one);
    };

    // The last player still in the round, whose total is the one to go back to.
    const last = playing.at(-1);
    const doubled =
        chosen !== null && scores[chosen] !== undefined && scores[chosen] !== heldBy(chosen);
    const beaten =
        chosen === null
            ? []
            : playing.filter((one) => one !== chosen && heldBy(one) <= heldBy(chosen));

    return (
        <div className="gtt-game">
            <div className="gtt-game-top">{changing ? null : actions}</div>
            <ChoiceField
                ref={field}
                label="Who ended the round?"
                hint="The player who turned their last card first. Their score doubles if it is above zero and another player has as little or less."
                name="ender"
                choices={playing.map((one) => ({
                    value: one,
                    label: nameOf(one),
                    hint: `scored ${String(heldBy(one))}`,
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
                <p>
                    {doubled
                        ? `${nameOf(chosen)}'s ${String(heldBy(chosen))} doubles to ${String(scores[chosen])}, since ${listOf(beaten.map(nameOf), 'and')} ${beaten.length === 1 ? 'has' : 'have'} as little or less.`
                        : `${nameOf(chosen)} keeps ${String(heldBy(chosen))}.`}
                </p>
            )}
            {last === undefined ? null : (
                <p className="dk-actions">
                    <Button
                        text
                        off={busy}
                        onClick={() => {
                            if (actionsOf.held()) return;
                            summary.clear();
                            void play.goTo(id, { part: 'entry', player: last });
                        }}
                    >
                        Change {nameOf(last)}&apos;s total
                    </Button>
                </p>
            )}
            <StatusLine ref={line} />
            {game.error === null ? null : <p role="alert">{game.error}</p>}
            <RoundDock
                id={id}
                index={draft.index}
                changing={changing}
                off={busy}
                refused={chosen === null}
                why="ender-hint"
                label={changing ? `Save round ${String(draft.index + 1)}` : 'Save the round'}
                onNext={() => {
                    if (chosen !== null) void actionsOf.next(chosen, skyjoRefusalWords);
                }}
                onCancel={() => void actionsOf.cancel()}
            />
        </div>
    );
};
