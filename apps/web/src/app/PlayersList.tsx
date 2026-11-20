import { useStatus } from '@jasonsdevspace/design-kit/react';

import { Link } from '../navigation.js';
import { hrefOf } from '../routes.js';
import { byAdded, openStore, refusalOf, type Store, withStore } from '../store/store.js';
import { Failure } from './failure.js';
import { AddByName, usePlayersRead } from './player-parts.js';
import { gamesOf, nameRefusal, newPlayerOf } from './players.js';

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

const UNREAD = 'Your players could not be opened in this browser. Reload the page to try again.';

export const PlayersList = ({
    open = openStore,
    newId = randomId,
    now = today,
}: PlayersListProps) => {
    const { read, setRead, unread } = usePlayersRead(open, UNREAD);
    const say = useStatus();

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
        // A removed player brought back keeps the day they were added, and so their place.
        setRead((before) =>
            before === null
                ? before
                : {
                      ...before,
                      players: [
                          ...before.players.filter(({ id }) => id !== player.id),
                          player,
                      ].sort(byAdded),
                  }
        );
        say(`${player.name} added.`);
        return null;
    };

    const listed = read?.players.filter(({ removed }) => !removed) ?? [];
    return (
        <>
            <Failure words={unread} />
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
            <AddByName onAdd={add} say={say} />
        </>
    );
};
