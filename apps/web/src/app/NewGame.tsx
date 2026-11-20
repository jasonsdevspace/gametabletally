import { GAMES } from '@gametabletally/scoring';
import {
    Button,
    ChoiceField,
    useBusy,
    useFocusAfterDraw,
    useStatus,
} from '@jasonsdevspace/design-kit/react';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';

import { navigate, usePlace } from '../navigation.js';
import { openPlay } from '../play/play.js';
import { hrefOf } from '../routes.js';
import type { SavedPlayer } from '../store/format.js';
import { openStore, refusalOf, type Store, withStore } from '../store/store.js';
import { playersOf } from '../website/games.js';
import { Dock, useToast } from './AppFrame.js';
import { Failure } from './failure.js';
import { Icon } from './icon.js';
import { AddByName, usePlayersRead, useRunning } from './player-parts.js';
import { moveSeat, playerNamed, seatsProblem } from './seats.js';

/**
 * The new game screen: the game, the players and their seats, and the button that starts it. The
 * game comes picked from the start screen's link, as `?game=`. The saved players are read from the
 * phone once the screen is running, and a name typed here is saved as a player at once, so it is
 * offered from then on. The seats are a list with a button to move each one up and one to move it
 * down, which a keyboard and a thumb both reach, and a screen reader is told each seat's new place.
 */

/** A seat's three actions, each with its icon and the words a screen reader says for it. */
const ACTIONS = {
    up: { icon: <path d="M12 19V5M6 11l6-6 6 6" />, words: (name: string) => `Move ${name} up` },
    down: {
        icon: <path d="M12 5v14M6 13l6 6 6-6" />,
        words: (name: string) => `Move ${name} down`,
    },
    remove: { icon: <path d="M6 6l12 12M18 6 6 18" />, words: (name: string) => `Remove ${name}` },
} as const;

type Action = keyof typeof ACTIONS;

/** What gets focus once the seats are drawn again, since the control pressed may be gone. */
type Focus =
    { readonly seat: string; readonly action: Action } | { readonly saved: string } | 'name';

/** The control a focus names, found by the data attributes the seats and saved players carry. */
const selectorOf = (wanted: Focus): string | null => {
    if (wanted === 'name') return null;
    if ('seat' in wanted)
        return `[data-seat="${CSS.escape(wanted.seat)}"][data-action="${wanted.action}"]`;
    return `[data-saved="${CSS.escape(wanted.saved)}"]`;
};

/** One seat: the player's name and place, and the buttons that move it and remove it. */
const SeatRow = ({
    id,
    name,
    at,
    last,
    onMove,
    onRemove,
}: {
    readonly id: string;
    readonly name: string;
    readonly at: number;
    readonly last: boolean;
    readonly onMove: (id: string, action: 'up' | 'down') => void;
    readonly onRemove: (id: string) => void;
}) => {
    const button = (action: Action, off: boolean, onClick: () => void) => (
        <Button data-seat={id} data-action={action} off={off} icon onClick={onClick}>
            <Icon>{ACTIONS[action].icon}</Icon>
            <span className="dk-visually-hidden">{ACTIONS[action].words(name)}</span>
        </Button>
    );
    return (
        <li>
            <div className="dk-row">
                <span className="dk-row-text">
                    <span className="dk-row-title">{name}</span>
                    <span className="dk-visually-hidden">, </span>
                    <span className="dk-row-detail gtt-seat">Seat {at + 1}</span>
                </span>
                <span className="dk-row-actions">
                    {button('up', at === 0, () => {
                        onMove(id, 'up');
                    })}
                    {button('down', last, () => {
                        onMove(id, 'down');
                    })}
                    {button('remove', false, () => {
                        onRemove(id);
                    })}
                </span>
            </div>
        </li>
    );
};

export interface NewGameProps {
    /** Opens the phone's database, which a test opens in memory. */
    readonly open?: () => Promise<Store>;
    /** Makes the id of a new player or a new game. */
    readonly newId?: () => string;
    readonly now?: () => Date;
    /** Asks the browser to keep what is saved, once the game has started, as the model does unless given. */
    readonly askToKeep?: (() => Promise<unknown>) | undefined;
    /** Moves to the started game, in the new game screen's place, so Back does not start it again. */
    readonly go?: (href: string) => void;
}

const today = () => new Date();
const randomId = () => crypto.randomUUID();
const goInPlace = (href: string) => {
    navigate(href, { replace: true });
};

/** No players, the same each time, so the seats' effects do not run again for nothing. */
const NONE: readonly SavedPlayer[] = [];

/**
 * The saved players, read as every screen that names players reads them, whether they have been,
 * and why they could not be, if so, with Try again reading them afresh.
 */
const usePlayers = (open: () => Promise<Store>) => {
    const { read, setRead, unread, tryAgain } = usePlayersRead(
        open,
        'Your saved players could not be opened in this browser.'
    );
    const setPlayers = useCallback(
        (change: (before: readonly SavedPlayer[]) => readonly SavedPlayer[]) => {
            setRead((now) => (now === null ? now : { ...now, players: change(now.players) }));
        },
        [setRead]
    );
    return { players: read?.players ?? NONE, setPlayers, loaded: read !== null, unread, tryAgain };
};

export const NewGame = ({
    open = openStore,
    newId = randomId,
    now = today,
    askToKeep,
    go = goInPlace,
}: NewGameProps) => {
    const { search } = usePlace();
    const running = useRunning();
    const { players, setPlayers, loaded, unread, tryAgain } = usePlayers(open);
    // The game the visitor chose here, which stands over the one the start screen's link picked.
    const [chosen, setChosen] = useState<string | null>(null);
    const [seats, setSeats] = useState<readonly string[]>([]);
    const say = useStatus();
    const show = useToast();
    const [refused, setRefused] = useState('');
    const [busy, setBusy] = useState(false);
    const startButton = useBusy<HTMLButtonElement>();
    const focusAfterDraw = useFocusAfterDraw();
    const screen = useRef<HTMLDivElement>(null);
    const nameField = useRef<HTMLInputElement>(null);
    // The seats and players as last drawn, for a name whose save is answered after they change.
    const latest = useRef({ seats, players });

    useLayoutEffect(() => {
        latest.current = { seats, players };
    }, [seats, players]);

    // After a press redraws the seats or the saved players, focus goes to the control the press
    // chose, which may be the one pressed or its neighbor, or to the name field when none is left.
    const focusOn = (wanted: Focus) => {
        const selector = selectorOf(wanted);
        focusAfterDraw(
            () => (selector ? (screen.current?.querySelector(selector) ?? null) : null),
            { fallbacks: [() => nameField.current] }
        );
    };

    // The link's game is read only once the screen is running, so the prerendered page, which
    // has no query, and the browser's first draw are the same.
    const asked = running ? new URLSearchParams(search).get('game') : null;
    const game = GAMES.find(({ id }) => id === (chosen ?? asked));
    const why = seatsProblem(game, seats.length);
    const byId = new Map(players.map((player) => [player.id, player]));
    const nameOf = (id: string) => byId.get(id)?.name ?? '';
    const offered = players.filter(({ id, removed }) => !removed && !seats.includes(id));

    /** Seats a player after the ones seated, `taken` of them, which a late answer passes. */
    const seat = (player: SavedPlayer, taken = seats.length) => {
        setSeats((before) => [...before, player.id]);
        say(`${player.name} takes seat ${taken + 1}.`);
    };

    const move = (id: string, action: 'up' | 'down') => {
        const moved = moveSeat(seats, id, action === 'up' ? -1 : 1);
        if (moved === seats) return;
        // Focus stays on the button pressed, unless the move took the seat to the end that turns it
        // off, when it goes to the seat's other move, which the kit's focus would not pass over.
        const at = moved.indexOf(id);
        const ended = action === 'down' ? at === moved.length - 1 : at === 0;
        focusOn({ seat: id, action: ended ? (action === 'down' ? 'up' : 'down') : action });
        setSeats(moved);
        say(`${nameOf(id)} moves to seat ${moved.indexOf(id) + 1}.`);
    };

    const remove = (id: string) => {
        const at = seats.indexOf(id);
        const left = seats.filter((other) => other !== id);
        const next = left[at] ?? left[at - 1];
        focusOn(next === undefined ? 'name' : { seat: next, action: 'remove' });
        setSeats(left);
        // The frame's toast says it and offers Undo, so a double tap that removes two seats can be
        // put right, and Undo puts the player back in the seat they left.
        const name = nameOf(id);
        show(`${name} is off the seats.`, {
            label: 'Undo',
            onAction: () => {
                const now = latest.current.seats;
                if (now.includes(id)) return;
                const back = Math.min(at, now.length);
                setSeats([...now.slice(0, back), id, ...now.slice(back)]);
                say(`${name} takes seat ${String(back + 1)} again.`);
            },
        });
    };

    const seatSaved = (player: SavedPlayer) => {
        const at = offered.indexOf(player);
        const next = offered[at + 1] ?? offered[at - 1];
        focusOn(next === undefined ? 'name' : { saved: next.id });
        seat(player);
    };

    const addByName = async (typed: string): Promise<string | null> => {
        // A name is matched against the saved players, so none is added before they are read.
        if (!loaded) return unread || 'Your saved players are still being read. Try again.';
        if (typed === '') return "Enter the player's name.";
        const known = playerNamed(players, typed);
        if (known && seats.includes(known.id)) return `${known.name} has a seat already.`;
        // A removed player is brought back by their name, so their games and this one are one
        // player's.
        const player: SavedPlayer = known
            ? { ...known, removed: false }
            : { id: newId(), name: typed, added: now().toISOString(), removed: false };
        try {
            if (!known || known.removed) await withStore(open, (store) => store.savePlayer(player));
        } catch (error) {
            return refusalOf(error) ?? 'The player could not be saved. Try again.';
        }
        // The seats may have changed while the player was saved.
        const seatedNow = latest.current.seats;
        if (seatedNow.includes(player.id)) return `${player.name} has a seat already.`;
        setPlayers((before) => [...before.filter(({ id }) => id !== player.id), player]);
        seat(player, seatedNow.length);
        return null;
    };

    const start = async () => {
        if (!game || why !== null) return;
        setBusy(true);
        setRefused('');
        const id = newId();
        try {
            const error = await withStore(open, async (store) => {
                const play = openPlay(store, () => now().toISOString(), askToKeep);
                await play.start({
                    id,
                    game: game.id,
                    rules: game.rules,
                    options: {},
                    players: seats,
                });
                return play.snapshot().games.find(({ saved }) => saved.id === id)?.error ?? null;
            });
            if (error === null) {
                go(hrefOf('game', id));
                return;
            }
            setRefused(error);
        } catch (error) {
            setRefused(refusalOf(error) ?? 'The game could not be started. Try again.');
        }
        setBusy(false);
    };

    return (
        <div className="dk-stack" ref={screen}>
            <Failure words={unread} onTryAgain={tryAgain} />
            <ChoiceField
                label="Game"
                name="game"
                choices={GAMES.map((each) => ({
                    value: each.id,
                    label: each.name,
                    hint: `for ${playersOf(each)}`,
                    checked: game?.id === each.id,
                    onChange: () => {
                        setChosen(each.id);
                    },
                }))}
            />
            <section className="dk-stack dk-stack-heading" aria-labelledby="seats">
                <h2 id="seats">Players, in seat order</h2>
                {seats.length === 0 ? (
                    <div className="dk-empty">
                        <p>No one is seated yet. Add the players in the order they sit.</p>
                    </div>
                ) : (
                    <ol className="dk-rows" role="list" aria-labelledby="seats">
                        {seats.map((id, at) => (
                            <SeatRow
                                key={id}
                                id={id}
                                name={nameOf(id)}
                                at={at}
                                last={at === seats.length - 1}
                                onMove={move}
                                onRemove={remove}
                            />
                        ))}
                    </ol>
                )}
            </section>
            <section className="dk-stack dk-stack-heading" aria-labelledby="add">
                <h2 id="add">Add a player</h2>
                {offered.length === 0 ? null : (
                    <div className="dk-actions" role="group" aria-label="Saved players">
                        {offered.map((player) => (
                            <Button
                                key={player.id}
                                data-saved={player.id}
                                onClick={() => {
                                    seatSaved(player);
                                }}
                            >
                                <span className="dk-visually-hidden">Add</span> {player.name}
                            </Button>
                        ))}
                    </div>
                )}
                <AddByName field={nameField} onAdd={addByName} />
            </section>
            <Dock>
                {/* Beside the button that was pressed, which may be far below the body's top. */}
                <Failure words={refused} />
                {why === null ? null : (
                    <p className="dk-field-hint" id="start-why">
                        {why}
                    </p>
                )}
                <Button
                    ref={startButton}
                    accent
                    tall
                    off={why !== null}
                    busy={busy ? 'Starting the game.' : false}
                    aria-describedby={why === null ? undefined : 'start-why'}
                    onClick={() => void start()}
                >
                    Start the game
                </Button>
            </Dock>
        </div>
    );
};
