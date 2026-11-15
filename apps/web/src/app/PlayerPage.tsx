import { Button } from '@jasonsdevspace/design-kit/react';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { Link, navigate, usePlace } from '../navigation.js';
import { hrefOf } from '../routes.js';
import type { SavedPlayer } from '../store/format.js';
import { openStore, refusalOf, type Store, withStore } from '../store/store.js';
import { useToast } from './AppFrame.js';
import { NAME_LENGTH, type Said, useRunning } from './player-parts.js';
import { gamesOf, nameRefusal, playersChanged, type PlayersRead, readPlayers } from './players.js';
import { cleanName } from './seats.js';

/**
 * A player's own page, named by `?id=`: their name, how many games they have played, the field
 * that renames them, saved as it is left, and the button that removes them. A removal acts at once
 * and goes back to the players screen, with a toast that offers Undo, which puts the player back
 * as they were. The player is read once the page is running, never in the prerender.
 */

export interface PlayerPageProps {
    /** Opens the phone's database, which a test opens in memory. */
    readonly open?: () => Promise<Store>;
    /** Moves to the players screen once a player is removed. */
    readonly go?: (href: string) => void;
}

/** The field a player's name is changed in, saved as it is left or as Enter is pressed. */
const RenameField = ({
    player,
    players,
    onRename,
}: {
    readonly player: SavedPlayer;
    readonly players: readonly SavedPlayer[];
    readonly onRename: (name: string) => Promise<string | null>;
}) => {
    const [name, setName] = useState(player.name);
    const [error, setError] = useState('');
    // Set while a name is being saved, so leaving the field as Enter saves it saves it once.
    const saving = useRef(false);

    const save = async () => {
        const typed = cleanName(name);
        if (saving.current || typed === player.name) return;
        const refused = nameRefusal(players, typed, player.id);
        if (refused !== null) {
            setError(refused);
            return;
        }
        saving.current = true;
        try {
            const failed = await onRename(typed);
            setError(failed ?? '');
            if (failed === null) setName(typed);
        } finally {
            saving.current = false;
        }
    };

    return (
        <form
            className="dk-field"
            noValidate
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                void save();
            }}
        >
            <label className="dk-field-label" htmlFor="player-name">
                Name
            </label>
            <p className="dk-field-hint" id="player-name-hint">
                Saved as you leave the field.
            </p>
            {error === '' ? null : (
                <p className="dk-field-error" id="player-name-error">
                    <span className="dk-visually-hidden">Error:</span> {error}
                </p>
            )}
            <input
                className="dk-input"
                id="player-name"
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="done"
                maxLength={NAME_LENGTH}
                value={name}
                aria-invalid={error === '' ? undefined : true}
                aria-describedby={
                    error === '' ? 'player-name-hint' : 'player-name-hint player-name-error'
                }
                onChange={(event) => {
                    setName(event.currentTarget.value);
                    setError('');
                }}
                onBlur={() => void save()}
            />
        </form>
    );
};

const goTo = (href: string) => {
    navigate(href);
};

export const PlayerPage = ({ open = openStore, go = goTo }: PlayerPageProps) => {
    const { search } = usePlace();
    const running = useRunning();
    const show = useToast();
    const [read, setRead] = useState<PlayersRead | null>(null);
    const [unread, setUnread] = useState('');
    const [said, setSaid] = useState<Said>({ words: '', count: 0 });
    const [failed, setFailed] = useState('');
    const id = running ? new URLSearchParams(search).get('id') : null;

    useEffect(() => {
        let left = false;
        readPlayers(open).then(
            (found) => {
                if (!left) setRead(found);
            },
            (error: unknown) => {
                if (!left)
                    setUnread(
                        refusalOf(error) ??
                            'This player could not be opened in this browser. Reload the page to try again.'
                    );
            }
        );
        return () => {
            left = true;
        };
    }, [open]);

    if (unread !== '') return <p role="alert">{unread}</p>;
    if (read === null || !running) return null;
    const player = read.players.find((one) => one.id === id && !one.removed);
    if (!player)
        return (
            <>
                <p>There is no player at this address. They may have been removed.</p>
                <p>
                    <Link href={hrefOf('players')}>All players</Link>
                </p>
            </>
        );

    const rename = async (name: string): Promise<string | null> => {
        const renamed = { ...player, name };
        try {
            await withStore(open, (store) => store.savePlayer(renamed));
        } catch (error) {
            return refusalOf(error) ?? 'The name could not be saved. Try again.';
        }
        setRead({
            ...read,
            players: read.players.map((one) => (one.id === renamed.id ? renamed : one)),
        });
        setSaid((before) => ({ words: `Saved as ${name}.`, count: before.count + 1 }));
        return null;
    };

    const remove = async () => {
        setFailed('');
        try {
            await withStore(open, (store) => store.removePlayer(player.id));
        } catch (error) {
            setFailed(refusalOf(error) ?? `${player.name} could not be removed. Try again.`);
            return;
        }
        go(hrefOf('players'));
        // The frame's toast outlives the move, so Undo is offered on the players screen.
        show(`${player.name} removed.`, {
            label: 'Undo',
            onAction: () => {
                void withStore(open, (store) => store.savePlayer(player)).then(
                    playersChanged,
                    () => {
                        show(`${player.name} could not be put back.`);
                    }
                );
            },
        });
    };

    const played = read.played.get(player.id) ?? 0;
    return (
        <>
            <h2 className="gtt-player-name">{player.name}</h2>
            <p>{played === 0 ? 'No games yet.' : `${gamesOf(played)} played.`}</p>
            <RenameField key={player.id} player={player} players={read.players} onRename={rename} />
            <p className="dk-visually-hidden" role="status">
                {said.words === '' ? null : <span key={said.count}>{said.words}</span>}
            </p>
            <div className="dk-actions">
                <Button onClick={() => void remove()}>Remove {player.name}</Button>
            </div>
            {failed === '' ? null : <p role="alert">{failed}</p>}
            <p className="gtt-fine">
                {played === 0
                    ? 'Removing a player who has played no game deletes them.'
                    : 'Removing a player keeps them in the games they played, and offers them for no new game.'}
            </p>
        </>
    );
};
