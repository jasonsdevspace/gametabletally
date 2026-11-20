import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useState,
    useSyncExternalStore,
} from 'react';

import { usePlace } from '../navigation.js';
import { type GameInPlay, openPlay, type Play } from '../play/play.js';
import { hrefOf } from '../routes.js';
import { openStore, refusalOf, type Store } from '../store/store.js';
import { Failure } from './failure.js';
import { useRunning } from './player-parts.js';

/*
 * A screen about one game in play, the round's or the scores', reads the game named by its address
 * the same way: once the screen is running, so the prerendered page holds only the frame, with the
 * database kept open while the screen is shown and let go once it is left.
 */

/** The phone's database and the model of its games in play, as a screen borrows them. */
interface Lease {
    readonly store: Store;
    readonly play: Play;
    /** Gives them back once the screen is left. */
    readonly release: () => void;
}

/** Lends the database and the model to a screen, opened by the functions the screen gives. */
type Lend = (open: () => Promise<Store>, now: () => Date) => Promise<Lease>;

/**
 * Outside the app's frame, as a test draws a screen alone, each screen opens its own and lets it go
 * as it is left, once every change asked of it is written.
 */
const lendAlone: Lend = async (open, now) => {
    const store = await open();
    const play = playOver(store, now);
    return {
        store,
        play,
        release: () => {
            void play.settled().finally(() => {
                store.close();
            });
        },
    };
};

const GamesContext = createContext<Lend>(lendAlone);

/**
 * The summary in the frame's toast, as every screen in the frame sees it: what takes it away while
 * it shows, and whether its Undo is under way. It is the frame's, since the toast is, so a screen
 * arrived at after the summary was offered takes it away as its next entry begins.
 */
export interface SummaryState {
    /** Keeps what takes the shown summary away, or null once it has gone. */
    readonly hold: (dismiss: (() => void) | null) => void;
    /** What takes the shown summary away, given once and forgotten, or null where none shows. */
    readonly take: () => (() => void) | null;
    readonly setUndoing: (undoing: boolean) => void;
    readonly undoing: () => boolean;
}

/** A summary state of its own. */
const summaryState = (): SummaryState => {
    let dismiss: (() => void) | null = null;
    let undoing = false;
    return {
        hold: (next) => {
            dismiss = next;
        },
        take: () => {
            const was = dismiss;
            dismiss = null;
            return was;
        },
        setUndoing: (next) => {
            undoing = next;
        },
        undoing: () => undoing,
    };
};

const SummaryContext = createContext<SummaryState | null>(null);

/** The frame's summary state, or one of the screen's own outside the frame. */
export const useSummaryState = (): SummaryState => {
    const shared = useContext(SummaryContext);
    const [own] = useState(summaryState);
    return shared ?? own;
};

/** What the frame holds once a screen has asked: the database and the model, opened once. */
interface Shared {
    current: Promise<{ readonly store: Store; readonly play: Play }> | null;
}

/** The model of the games over a store, keeping time by the clock given. */
const playOver = (store: Store, now: () => Date): Play =>
    openPlay(store, () => now().toISOString());

/**
 * Lends what is shared, opening it for the first screen that asks, and afresh where the store has
 * been closed since, as a newer build in another tab closes it when it upgrades the database. The
 * first screen's way of opening the database and its clock are the frame's from then on.
 */
const lenderOf =
    (shared: Shared): Lend =>
    async (open, now) => {
        const held = (shared.current ??= open().then((store) => ({
            store,
            play: playOver(store, now),
        })));
        try {
            const both = await held;
            if (!both.store.closed()) return { ...both, release: () => undefined };
        } catch (error: unknown) {
            // A failure to open is the screen's to say, and the next screen asks afresh.
            if (shared.current === held) shared.current = null;
            throw error;
        }
        if (shared.current === held) shared.current = null;
        return lenderOf(shared)(open, now);
    };

/**
 * The games in play for every screen inside the app's frame: one database and one model, opened by
 * the first screen that asks and kept while the frame is, so a toast's Undo for a change made on
 * one screen still works on the next, and no tap is lost to a database closed as a screen is left.
 * The frame lets them go once it is left itself, after every change asked of them is written.
 */
export const GamesProvider = ({ children }: { readonly children: ReactNode }) => {
    const [shared] = useState<Shared>(() => ({ current: null }));
    const [lend] = useState(() => lenderOf(shared));
    const [summary] = useState(summaryState);
    useEffect(
        () => () => {
            void shared.current?.then(({ store, play }) =>
                play.settled().finally(() => {
                    store.close();
                })
            );
            shared.current = null;
        },
        [shared]
    );
    return (
        <GamesContext.Provider value={lend}>
            <SummaryContext.Provider value={summary}>{children}</SummaryContext.Provider>
        </GamesContext.Provider>
    );
};

export interface OpenedGameProps {
    /** Opens the phone's database, which a test opens in memory. */
    readonly open?: () => Promise<Store>;
    readonly now?: () => Date;
}

/** What a screen draws once the game is read: the model of the games in play, and the names. */
export interface OpenedGame {
    readonly id: string;
    readonly play: Play;
    readonly names: ReadonlyMap<string, string>;
    /** The ids of the players this phone still holds, not removed, as a new game may seat them. */
    readonly present: ReadonlySet<string>;
}

/** The game in play of the id given, as the model holds it now, kept in step with every change. */
export const useGame = (play: Play, id: string): GameInPlay | undefined =>
    useSyncExternalStore(play.subscribe, play.snapshot, play.snapshot).games.find(
        ({ saved }) => saved.id === id
    );

/** A player's name, or words that stand for one this phone no longer holds. */
export const nameIn = (names: ReadonlyMap<string, string>, player: string): string =>
    names.get(player) ?? 'Another player';

const today = () => new Date();

/** The games in play as a screen has them once read, or why they could not be. */
type Lent = Omit<OpenedGame, 'id'> | { readonly failed: string };

/**
 * The model of the games in play and the players' names, lent to a screen once it is running and
 * read afresh on each arrival, so a change made in another tab is drawn, or why they could not be
 * read. It is read again for each key given, and null while it is being read.
 */
const useLent = (
    key: string | null,
    open: () => Promise<Store>,
    now: () => Date,
    /** Whether what was read for an earlier key is kept in view while a later one is read. */
    keep = false
): { readonly key: string; readonly lent: Lent } | null => {
    // What was read, and for which key, so a move to another game never draws the last one.
    const [read, setRead] = useState<{ readonly key: string; readonly lent: Lent } | null>(null);
    const lend = useContext(GamesContext);
    useEffect(() => {
        if (key === null) return undefined;
        // Set once the screen is left, so what was lent after that is given back at once.
        const shown: { left: boolean; release: (() => void) | null } = {
            left: false,
            release: null,
        };
        const left = () => shown.left;
        const borrow = async () => {
            const { store, play, release } = await lend(open, now);
            shown.release = release;
            if (left()) {
                release();
                return;
            }
            const [, players] = await Promise.all([play.load(), store.players()]);
            // Read again past the wait, since the screen may have been left during it.
            if (!left())
                setRead({
                    key,
                    lent: {
                        play,
                        names: new Map(players.map((one) => [one.id, one.name])),
                        present: new Set(
                            players.filter((one) => !one.removed).map((one) => one.id)
                        ),
                    },
                });
        };
        borrow().catch((error: unknown) => {
            if (!left())
                setRead({
                    key,
                    lent: { failed: refusalOf(error) ?? 'Your saved games could not be read.' },
                });
        });
        return () => {
            shown.left = true;
            shown.release?.();
        };
    }, [key, open, now, lend]);
    // A read kept in view while a later one is read is one that worked, so a failure goes as it is
    // tried again and comes back, heard again, where it fails again.
    if (read?.key === key) return read;
    return keep && read !== null && !('failed' in read.lent) ? read : null;
};

/**
 * The game named by the address, read once the screen is running. A screen draws what it is given
 * once the game is read, and the same words as every other screen about a game while it is not.
 */
export const WithOpenedGame = ({
    open = openStore,
    now = today,
    children,
}: OpenedGameProps & { readonly children: (game: OpenedGame) => ReactNode }) => {
    const running = useRunning();
    const { search } = usePlace();
    const id = running ? new URLSearchParams(search).get('id') : null;
    // Each Try again reads the game afresh.
    const [attempts, setAttempts] = useState(0);
    const read = useLent(id === null ? null : `${id} ${String(attempts)}`, open, now);
    if (!running) return null;
    if (id === null)
        return (
            <p>
                No game is named here. <a href={hrefOf('play')}>Start or continue a game</a>.
            </p>
        );
    if (read === null) return null;
    if ('failed' in read.lent)
        return (
            <Failure
                words={read.lent.failed}
                onTryAgain={() => {
                    setAttempts((count) => count + 1);
                }}
            />
        );
    return children({ id, ...read.lent });
};

/**
 * Every game in play, read once the screen is running, for a screen about all of them, as the
 * start screen is. It draws nothing while they are read, and only the refusal where they could not
 * be.
 */
export const WithGames = ({
    open = openStore,
    now = today,
    children,
}: OpenedGameProps & { readonly children: (games: Omit<OpenedGame, 'id'>) => ReactNode }) => {
    const running = useRunning();
    // Read again whenever the app comes back to the front, since a game may have moved on or ended
    // in another tab, or a player been added there, with what was read kept in view meanwhile. A
    // read that failed is tried again the same way, and a database another tab closed is opened
    // afresh.
    const [arrivals, setArrivals] = useState(0);
    useEffect(() => {
        const again = () => {
            if (document.visibilityState === 'visible') setArrivals((count) => count + 1);
        };
        document.addEventListener('visibilitychange', again);
        window.addEventListener('pageshow', again);
        return () => {
            document.removeEventListener('visibilitychange', again);
            window.removeEventListener('pageshow', again);
        };
    }, []);
    const read = useLent(running ? `all ${String(arrivals)}` : null, open, now, true);
    if (read === null) return null;
    if ('failed' in read.lent)
        return (
            <Failure
                words={read.lent.failed}
                onTryAgain={() => {
                    setArrivals((count) => count + 1);
                }}
            />
        );
    return children(read.lent);
};
