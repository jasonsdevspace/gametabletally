import { useEffect, useRef, useState } from 'react';

import { Link } from '../navigation.js';
import { hrefOf } from '../routes.js';
import { openStore, refusalOf, type Store, withStore } from '../store/store.js';
import { AddByName, type Said } from './player-parts.js';
import {
    gamesOf,
    nameRefusal,
    newPlayerOf,
    PLAYERS_CHANGED,
    type PlayersRead,
    readPlayers,
} from './players.js';

/**
 * The players screen: every player still offered for a new game, in the order they were added,
 * each a row that leads to their own page, and the field to add one. A player is renamed and
 * removed on their own page. The players are read once the screen is running, never in the
 * prerender, and again when a removed player is put back from the toast.
 */

export interface PlayersListProps {
    /** Opens the phone's database, which a test opens in memory. */
    readonly open?: () => Promise<Store>;
    /** Makes the id of a new player. */
    readonly newId?: () => string;
    readonly now?: () => Date;
}

const today = () => new Date();
const randomId = () => crypto.randomUUID();

export const PlayersList = ({
    open = openStore,
    newId = randomId,
    now = today,
}: PlayersListProps) => {
    const [read, setRead] = useState<PlayersRead | null>(null);
    const [unread, setUnread] = useState('');
    const [said, setSaid] = useState<Said>({ words: '', count: 0 });
    const nameField = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let left = false;
        const again = () => {
            readPlayers(open).then(
                (found) => {
                    if (left) return;
                    setRead(found);
                    setUnread('');
                },
                (error: unknown) => {
                    if (!left)
                        setUnread(
                            refusalOf(error) ??
                                'Your players could not be opened in this browser. Reload the page to try again.'
                        );
                }
            );
        };
        again();
        window.addEventListener(PLAYERS_CHANGED, again);
        return () => {
            left = true;
            window.removeEventListener(PLAYERS_CHANGED, again);
        };
    }, [open]);

    const add = async (typed: string): Promise<string | null> => {
        // A name is checked against the saved players, so none is added before they are read.
        if (read === null) return unread || 'Your players are still being read. Try again.';
        const refused = nameRefusal(read.players, typed);
        if (refused !== null) return refused;
        const player = newPlayerOf(read.players, typed, newId(), now());
        try {
            await withStore(open, (store) => store.savePlayer(player));
        } catch (error) {
            return refusalOf(error) ?? 'The player could not be saved. Try again.';
        }
        setRead((before) =>
            before === null
                ? before
                : {
                      ...before,
                      players: [...before.players.filter(({ id }) => id !== player.id), player],
                  }
        );
        setSaid((before) => ({ words: `${player.name} added.`, count: before.count + 1 }));
        return null;
    };

    const listed = read?.players.filter(({ removed }) => !removed) ?? [];
    return (
        <>
            {unread === '' ? null : <p role="alert">{unread}</p>}
            {read === null ? null : listed.length === 0 ? (
                <p>
                    No players yet. A player is saved the first time they sit down to a game, and
                    each one is listed here. Add one below, or start a game.
                </p>
            ) : (
                <ul className="dk-rows" role="list" aria-label="Players">
                    {listed.map((player) => (
                        <li key={player.id}>
                            <Link className="dk-row" href={hrefOf('player', player.id)}>
                                <span className="dk-row-text">
                                    <span className="dk-row-title">{player.name}</span>
                                    <span className="dk-visually-hidden">, </span>
                                    <span className="dk-row-detail">
                                        {gamesOf(read.played.get(player.id) ?? 0)}
                                    </span>
                                </span>
                                <span className="dk-row-sign" aria-hidden="true">
                                    ›
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
            <AddByName field={nameField} onAdd={add} />
            <p className="dk-visually-hidden" role="status">
                {said.words === '' ? null : <span key={said.count}>{said.words}</span>}
            </p>
        </>
    );
};
