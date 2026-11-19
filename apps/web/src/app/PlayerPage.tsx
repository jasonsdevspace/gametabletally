import { Button, Callout, InputField, StatusLine } from '@jasonsdevspace/design-kit/react';
import { type FormEvent, useEffect, useRef, useState } from 'react';

import { Link, navigate, usePlace } from '../navigation.js';
import { hrefOf } from '../routes.js';
import type { SavedPlayer } from '../store/format.js';
import { openStore, refusalOf, type Store, withStore } from '../store/store.js';
import { useToast } from './AppFrame.js';
import { NAME_LENGTH, usePlayersRead, useRunning } from './player-parts.js';
import { gamesOf, nameRefusal, playersChanged } from './players.js';
import { cleanName } from './seats.js';
import { useStatus } from './status.js';

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
    say,
}: {
    readonly player: SavedPlayer;
    readonly players: readonly SavedPlayer[];
    readonly onRename: (name: string) => Promise<string | null>;
    /** Says a refusal on the screen's status line, since the kit's field error is not live. */
    readonly say: (words: string) => void;
}) => {
    const [name, setName] = useState(player.name);
    const [error, setError] = useState('');

    // Each save is put in order by the page, which skips one that changes nothing, so a blur that
    // follows Enter saves the name once and a name typed while another saves is saved after it.
    const save = async () => {
        const typed = cleanName(name);
        if (typed === player.name) return;
        const refused = nameRefusal(players, typed, player.id);
        if (refused !== null) {
            setError(refused);
            say(refused);
            return;
        }
        const failed = await onRename(typed);
        setError(failed ?? '');
        if (failed !== null) say(failed);
        // Tidied to the name saved, unless something else has been typed since.
        if (failed === null) setName((now) => (cleanName(now) === typed ? typed : now));
    };

    return (
        <form
            noValidate
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
                event.preventDefault();
                void save();
            }}
        >
            <InputField
                id="player-name"
                label="Name"
                hint="Saved as you leave the field or press Enter."
                error={error}
                autoComplete="off"
                autoCapitalize="words"
                enterKeyHint="done"
                maxLength={NAME_LENGTH}
                value={name}
                onChange={(event) => {
                    setName(event.currentTarget.value);
                    setError('');
                }}
                onBlur={() => void save()}
            />
        </form>
    );
};

/** Goes to the players screen in the removed player's place, so Back does not lead to no one. */
const goInPlace = (href: string) => {
    navigate(href, { replace: true });
};

const UNREAD = 'This player could not be opened in this browser. Reload the page to try again.';

export const PlayerPage = ({ open = openStore, go = goInPlace }: PlayerPageProps) => {
    const { search } = usePlace();
    const running = useRunning();
    const show = useToast();
    const { read, setRead, unread } = usePlayersRead(open, UNREAD);
    const [line, say] = useStatus();
    const [failed, setFailed] = useState('');
    const id = running ? new URLSearchParams(search).get('id') : null;
    const player = read?.players.find((one) => one.id === id && !one.removed);
    // The player as last saved, which a save waiting its turn reads when it runs.
    const current = useRef(player);
    // Each save waits for the one before it, so a rename and a removal land in the order made.
    const queue = useRef<Promise<unknown>>(Promise.resolve());
    // Set once a removal starts, so a second press does not remove the player twice.
    const removing = useRef(false);

    useEffect(() => {
        current.current = player;
    }, [player]);

    if (unread !== '')
        return (
            <Callout tone="danger" live="alert">
                {unread}
            </Callout>
        );
    if (read === null || !running) return null;
    if (!player)
        return (
            <>
                <p>There is no player at this address. They may have been removed.</p>
                <p>
                    <Link href={hrefOf('players')}>All players</Link>
                </p>
            </>
        );

    const inOrder = <Result,>(work: () => Promise<Result>): Promise<Result> => {
        const run = queue.current.then(work, work);
        queue.current = run.catch(() => undefined);
        return run;
    };

    const rename = (name: string): Promise<string | null> =>
        inOrder(async () => {
            const was = current.current;
            if (!was || was.name === name) return null;
            const renamed = { ...was, name };
            try {
                await withStore(open, (store) => store.savePlayer(renamed));
            } catch (error) {
                return refusalOf(error) ?? 'The name could not be saved. Try again.';
            }
            current.current = renamed;
            setRead((before) =>
                before === null
                    ? before
                    : {
                          ...before,
                          players: before.players.map((one) =>
                              one.id === renamed.id ? renamed : one
                          ),
                      }
            );
            say(`Saved as ${name}.`);
            return null;
        });

    /** Puts a removed player back as they were, unless another player has taken their name. */
    const putBack = (was: SavedPlayer) => {
        withStore(open, async (store) => {
            const taken = nameRefusal(await store.players(), was.name, was.id) !== null;
            if (!taken) await store.savePlayer(was);
            return taken;
        }).then(
            (taken) => {
                if (taken)
                    show(`${was.name} could not be put back, since another player has the name.`);
                else playersChanged();
            },
            () => {
                show(`${was.name} could not be put back.`);
            }
        );
    };

    const remove = async () => {
        if (removing.current) return;
        removing.current = true;
        setFailed('');
        let was: SavedPlayer | undefined;
        try {
            was = await inOrder(async () => {
                const last = current.current;
                if (last) await withStore(open, (store) => store.removePlayer(last.id));
                return last;
            });
        } catch (error) {
            removing.current = false;
            setFailed(refusalOf(error) ?? `${player.name} could not be removed. Try again.`);
            return;
        }
        if (!was) return;
        const removed = was;
        go(hrefOf('players'));
        // The frame's toast outlives the move, so Undo is offered on the players screen.
        show(`${removed.name} removed.`, {
            label: 'Undo',
            onAction: () => {
                putBack(removed);
            },
        });
    };

    const played = read.played.get(player.id) ?? 0;
    return (
        <>
            <h2 className="gtt-player-name">{player.name}</h2>
            <p>{played === 0 ? 'No games yet.' : `${gamesOf(played)} played.`}</p>
            <RenameField
                key={player.id}
                player={player}
                players={read.players}
                onRename={rename}
                say={say}
            />
            <StatusLine ref={line} />
            <div className="dk-actions">
                <Button onClick={() => void remove()}>Remove {player.name}</Button>
            </div>
            <Callout tone="danger" live="alert">
                {failed}
            </Callout>
            <p className="gtt-fine">
                {played === 0
                    ? 'Removing a player who has played no game deletes them.'
                    : 'Removing a player keeps them in the games they played, but no longer offers them for a new game.'}
            </p>
        </>
    );
};
