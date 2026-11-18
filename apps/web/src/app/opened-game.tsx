import { type ReactNode, useEffect, useState } from 'react';

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

    useEffect(() => {
        if (id === null) return undefined;
        // Set once the screen is left, so a database opened after that is let go at once.
        const shown: { left: boolean; store: Store | null; play: Play | null } = {
            left: false,
            store: null,
            play: null,
        };
        const left = () => shown.left;
        const read = async () => {
            const ready = await open();
            shown.store = ready;
            if (left()) {
                ready.close();
                return;
            }
            const play = openPlay(ready, () => now().toISOString());
            shown.play = play;
            const [, players] = await Promise.all([play.load(), ready.players()]);
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
            // A tap or a save still being written when the screen is left, as a link in its dock
            // or the tab bar moves on at once, is written before the database is let go.
            const { store, play } = shown;
            if (store === null) return;
            void (play?.settled() ?? Promise.resolve()).finally(() => {
                store.close();
            });
        };
    }, [id, open, now]);

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
