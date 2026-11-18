import { createContext, type ReactNode, useContext, useEffect, useState } from 'react';

import { usePlace } from '../navigation.js';
import { openPlay, type Play } from '../play/play.js';
import { hrefOf } from '../routes.js';
import { openStore, refusalOf, type Store } from '../store/store.js';
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
    const play = openPlay(store, () => now().toISOString());
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

/** Lends what is shared, opening it for the first screen that asks. */
const lenderOf =
    (shared: Shared): Lend =>
    (open, now) => {
        const held = (shared.current ??= open().then((store) => ({
            store,
            play: openPlay(store, () => now().toISOString()),
        })));
        // A failure to open is the screen's to say, and the next screen asks afresh.
        held.catch(() => {
            if (shared.current === held) shared.current = null;
        });
        return held.then((both) => ({ ...both, release: () => undefined }));
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
}

/** A player's name, or words that stand for one this phone no longer holds. */
export const nameIn = (names: ReadonlyMap<string, string>, player: string): string =>
    names.get(player) ?? 'Another player';

const today = () => new Date();

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
    // What was read, and for which address, so a move to another game never draws the last one.
    const [opened, setOpened] = useState<
        OpenedGame | { readonly id: string; readonly failed: string } | null
    >(null);

    const lend = useContext(GamesContext);

    useEffect(() => {
        if (id === null) return undefined;
        // Set once the screen is left, so what was lent after that is given back at once.
        const shown: { left: boolean; release: (() => void) | null } = {
            left: false,
            release: null,
        };
        const left = () => shown.left;
        const read = async () => {
            const { store, play, release } = await lend(open, now);
            shown.release = release;
            if (left()) {
                release();
                return;
            }
            // Read afresh on each arrival, so a change made in another tab is drawn.
            const [, players] = await Promise.all([play.load(), store.players()]);
            // Read again past the wait, since the screen may have been left during it.
            if (!left())
                setOpened({ id, play, names: new Map(players.map((one) => [one.id, one.name])) });
        };
        read().catch((error: unknown) => {
            if (!left())
                setOpened({
                    id,
                    failed: refusalOf(error) ?? 'Your saved games could not be read.',
                });
        });
        return () => {
            shown.left = true;
            shown.release?.();
        };
    }, [id, open, now, lend]);

    if (!running) return null;
    if (id === null)
        return (
            <p>
                No game is named here. <a href={hrefOf('play')}>Start or continue a game</a>.
            </p>
        );
    if (opened?.id !== id) return null;
    if ('failed' in opened) return <p role="alert">{opened.failed}</p>;
    return children(opened);
};
