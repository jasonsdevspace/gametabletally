import { GAMES } from '@gametabletally/scoring';
import { useEffect, useState } from 'react';

import { Link } from '../navigation.js';
import { hrefOf } from '../routes.js';
import { openStore, refusalOf, type Store } from '../store/store.js';
import { cardOf, playersOf } from '../website/games.js';
import { NOT_AFFILIATED } from '../website/Website.js';
import { type Continuing, readContinuing } from './in-play.js';

/**
 * The start screen, where the app opens: the game in play to continue, when there is one, and
 * each game to start a new one of. The game in play is read from the phone once the screen is
 * running, never in the prerender, so the prerendered page holds only what every visitor sees. It
 * is read again when the app comes back to the front, since a game may have moved on in another
 * tab or ended there.
 */

/** Where starting a game of one kind leads: the new game screen, with the game picked. */
export const newGameOf = (game: string): string =>
    `${hrefOf('new')}?${new URLSearchParams({ game }).toString()}`;

export const PlayStart = ({ open = openStore }: { readonly open?: () => Promise<Store> }) => {
    const [continuing, setContinuing] = useState<Continuing | null>(null);
    const [refused, setRefused] = useState('');

    useEffect(() => {
        let left = false;
        const read = () => {
            readContinuing(open).then(
                (found) => {
                    if (left) return;
                    setContinuing(found);
                    setRefused('');
                },
                // A phone whose games cannot be read offers only a new game, and says why where
                // the store has words for it.
                (error: unknown) => {
                    if (left) return;
                    setContinuing(null);
                    setRefused(refusalOf(error) ?? '');
                }
            );
        };
        const again = () => {
            if (document.visibilityState === 'visible') read();
        };
        read();
        document.addEventListener('visibilitychange', again);
        window.addEventListener('pageshow', again);
        return () => {
            left = true;
            document.removeEventListener('visibilitychange', again);
            window.removeEventListener('pageshow', again);
        };
    }, [open]);

    return (
        <>
            {refused === '' ? null : <p role="alert">{refused}</p>}
            {continuing ? (
                <div className="dk-panel dk-panel-raised gtt-continue">
                    <h2 className="dk-eyebrow">Game in play</h2>
                    <p className="gtt-continue-game">
                        <strong>{continuing.name}</strong>
                        <span>Round {continuing.round}</span>
                    </p>
                    <p>{continuing.turn}</p>
                    <Link
                        className="dk-button dk-button-accent dk-button-tall"
                        href={hrefOf('game', continuing.id)}
                    >
                        Continue the game
                    </Link>
                </div>
            ) : null}
            <div className="gtt-start">
                <h2 className="dk-eyebrow" id="start">
                    Start a new game
                </h2>
                <ul className="dk-rows dk-rows-tiles" role="list" aria-labelledby="start">
                    {GAMES.map((game) => (
                        <li key={game.id}>
                            <Link
                                className="dk-row gtt-game"
                                data-game={game.id}
                                href={newGameOf(game.id)}
                            >
                                <span className="dk-row-text">
                                    <span className="dk-row-title">{game.name}</span>
                                    <span className="dk-visually-hidden">, </span>
                                    <span className="dk-row-detail">
                                        {cardOf(game.id).line} {playersOf(game)}.
                                    </span>
                                </span>
                                <span className="dk-row-sign" aria-hidden="true">
                                    ›
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
            <p className="gtt-fine">{NOT_AFFILIATED}</p>
        </>
    );
};
