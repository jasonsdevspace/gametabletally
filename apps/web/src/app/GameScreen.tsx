import {
    FLIP_7_MODIFIERS,
    type Flip7Entry,
    type Flip7Modifier,
    GAMES,
    type Problem,
} from '@gametabletally/scoring';
import { Button, StatusLine } from '@jasonsdevspace/design-kit/react';
import { useEffect, useState, useSyncExternalStore } from 'react';

import { usePlace } from '../navigation.js';
import { type GameInPlay, openPlay, type Play } from '../play/play.js';
import { hrefOf } from '../routes.js';
import { isRecord } from '../store/format.js';
import { openStore, refusalOf, type Store } from '../store/store.js';
import { Dock } from './AppFrame.js';
import { useRunning } from './player-parts.js';
import { ScoreHeader } from './ScoreHeader.js';
import { useStatus } from './status.js';

/*
 * The game in play: the score header on top, and below it, in reach of a thumb, the keys a round
 * is entered with, player by player in seat order. Flip 7 is entered by tapping the cards a player
 * ends the round holding. Each tap is kept at once, so a page loaded again in the middle of a hand
 * comes back to it, and the header's total, which the rules work out from what was kept, shows the
 * round as it stands. The button for the next player names them, and after the last it saves the
 * round. Nothing here adds anything up.
 */

/** The number cards, from 0 to 12. */
const NUMBERS = Array.from({ length: 13 }, (_, card) => card);

/** How many different numbers end a round of Flip 7, and earn its bonus. */
const FLIP = 7;
const BONUS = 15;

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
    onChange,
}: {
    readonly name: string;
    readonly hand: Flip7Entry;
    /** What the rules refuse in the hand, in words, or an empty string. */
    readonly why: string;
    readonly onChange: (hand: Flip7Entry) => void;
}) => (
    <section className="gtt-keys" aria-label={`${name}'s cards`}>
        <div className="dk-button-grid gtt-bust" role="group" aria-label="Bust">
            <Button
                pressed={hand.bust}
                aria-describedby={hand.bust ? 'bust-hint' : undefined}
                onClick={() => {
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
                    off={hand.bust}
                    onClick={() => {
                        if (hand.bust) return;
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
                    off={hand.bust}
                    onClick={() => {
                        if (hand.bust) return;
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

/** The step after the one the round is at that still has nothing entered, or null for none. */
const followingPlayer = (game: GameInPlay): string | null => {
    const draft = game.draft;
    const step = draft?.step ?? null;
    if (draft === null || step === null) return null;
    const { steps, round } = draft;
    const at = steps.findIndex((one) => one.player === step.player && one.part === step.part);
    const empty = (one: (typeof steps)[number]) =>
        one.player !== null &&
        one.player !== step.player &&
        !Object.hasOwn(round.entries, one.player);
    return (steps.slice(at + 1).find(empty) ?? steps.slice(0, at).find(empty))?.player ?? null;
};

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
}: {
    readonly play: Play;
    readonly game: GameInPlay & { readonly draft: NonNullable<GameInPlay['draft']> };
    readonly player: string;
    readonly names: ReadonlyMap<string, string>;
}) => {
    const { draft } = game;
    const id = game.saved.id;
    const nameOf = (one: string) => names.get(one) ?? 'Another player';
    const name = nameOf(player);
    const before = game.result.totals[player] ?? 0;
    const round = draft.preview.rounds[draft.index]?.scores[player] ?? 0;
    const problem = draft.preview.problems.find(
        (one) => one.round === draft.index && one.player === player
    );
    const why = problem ? refusalWords(problem) : '';
    const following = followingPlayer(game);
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
    const [busy, setBusy] = useState(false);
    const [line, say] = useStatus();

    // A refusal is said once as it appears, since focus is on the key that caused it.
    useEffect(() => {
        if (why !== '') say(why);
    }, [why, say]);

    const change = (next: Flip7Entry) => {
        setState((now) => ({ ...now, hand: next }));
        void play.hold(id, next);
    };

    const saveRound = async () => {
        const saved = await play.saveRound(id);
        if (saved.saved) say(`Round ${String(draft.index + 1)} saved.`);
        else if (saved.error !== null) say(saved.error);
        else
            say(
                saved.problems[0]
                    ? refusalWords(saved.problems[0])
                    : 'The round could not be saved.'
            );
    };

    const next = async () => {
        if (why !== '' || busy) return;
        setBusy(true);
        try {
            // After the last player the hand is kept where it is and the round saved at once, so
            // the round never stands with no step, which would take this view off the page.
            if (following === null) {
                await play.hold(id, hand);
                await saveRound();
            } else await play.enter(id, hand);
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="gtt-game">
            <ScoreHeader
                name={name}
                total={before + taken}
                line={lineOf({ before, round: taken, first: draft.index === 0, hand })}
            />
            <Flip7Keys name={name} hand={hand} why={why} onChange={change} />
            <StatusLine ref={line} />
            {game.error === null ? null : <p role="alert">{game.error}</p>}
            <Dock>
                <Button
                    accent
                    tall
                    off={why !== '' || busy}
                    aria-describedby={why === '' ? undefined : 'hand-why'}
                    onClick={() => void next()}
                >
                    {following === null ? 'Save the round' : `Next: ${nameOf(following)}`}
                </Button>
            </Dock>
        </div>
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
    const snapshot = useSyncExternalStore(play.subscribe, play.snapshot, play.snapshot);
    const game = snapshot.games.find(({ saved }) => saved.id === id);
    if (!game) return <p>This game is not on this phone.</p>;
    const gameName =
        GAMES.find(({ id: known }) => known === game.saved.game)?.name ?? game.saved.game;
    const { draft } = game;
    if (draft === null) return <p>This game of {gameName} is over.</p>;
    const player = draft.step?.player ?? null;
    if (player === null) return <p>Every score of the round is in.</p>;
    if (game.saved.game !== 'flip-7')
        return (
            <div className="gtt-game">
                <ScoreHeader
                    name={names.get(player) ?? 'Another player'}
                    total={game.result.totals[player] ?? 0}
                    line=""
                />
                <p>Entering a round of {gameName} comes to the app after Flip 7.</p>
            </div>
        );
    return <Flip7Round play={play} game={{ ...game, draft }} player={player} names={names} />;
};

export interface GameScreenProps {
    /** Opens the phone's database, which a test opens in memory. */
    readonly open?: () => Promise<Store>;
    readonly now?: () => Date;
}

const today = () => new Date();

/**
 * The game in play named by the address, read once the screen is running, so the prerendered page
 * holds only the frame. The database stays open while the screen is shown, since every tap saves.
 */
export const GameScreen = ({ open = openStore, now = today }: GameScreenProps) => {
    const running = useRunning();
    const { search } = usePlace();
    const id = running ? new URLSearchParams(search).get('id') : null;
    const [opened, setOpened] = useState<
        | { readonly play: Play; readonly names: ReadonlyMap<string, string> }
        | { readonly failed: string }
        | null
    >(null);

    useEffect(() => {
        if (id === null) return undefined;
        // Set once the screen is left, so a database opened after that is let go at once.
        const shown: { left: boolean; store: Store | null } = { left: false, store: null };
        const left = () => shown.left;
        open().then(
            async (ready) => {
                shown.store = ready;
                if (shown.left) {
                    ready.close();
                    return;
                }
                const play = openPlay(ready, () => now().toISOString());
                const [, players] = await Promise.all([play.load(), ready.players()]);
                // Read again past the wait, since the screen may have been left during it.
                if (!left())
                    setOpened({ play, names: new Map(players.map((one) => [one.id, one.name])) });
            },
            (error: unknown) => {
                if (!shown.left)
                    setOpened({
                        failed: refusalOf(error) ?? 'Your saved games could not be read.',
                    });
            }
        );
        return () => {
            shown.left = true;
            shown.store?.close();
        };
    }, [id, open, now]);

    if (!running) return null;
    if (id === null)
        return (
            <p>
                No game is named here. <a href={hrefOf('play')}>Start or continue a game</a>.
            </p>
        );
    if (opened === null) return null;
    if ('failed' in opened) return <p role="alert">{opened.failed}</p>;
    return <Entry play={opened.play} id={id} names={opened.names} />;
};
