import { GAMES } from '@gametabletally/scoring';
import { useEffect, useState } from 'react';

import { Link } from '../navigation.js';
import { hrefOf } from '../routes.js';
import { openStore, type Store } from '../store/store.js';
import { cardOf, playersOf } from '../website/games.js';
import { NOT_AFFILIATED } from '../website/Website.js';
import { AppFrame } from './AppFrame.js';
import { type Continuing, readContinuing } from './in-play.js';

/**
 * The start screen, where the app opens: the game in play to continue, when there is one, and
 * each game to start a new one of. The game in play is read from the phone once the screen is
 * running, never in the prerender, so the prerendered page holds only what every visitor sees.
 */

/** Where starting a game of one kind leads: the new game screen, with the game picked. */
export const newGameOf = (game: string): string =>
    `${hrefOf('new')}?${new URLSearchParams({ game }).toString()}`;

export const PlayStart = ({ open = openStore }: { readonly open?: () => Promise<Store> }) => {
    const [continuing, setContinuing] = useState<Continuing | null>(null);

    useEffect(() => {
        let left = false;
        // A phone whose games cannot be read offers only a new game, which is all it can start.
        readContinuing(open).then(
            (found) => {
                if (!left) setContinuing(found);
            },
            () => undefined
        );
        return () => {
            left = true;
        };
    }, [open]);

    return (
        <AppFrame
            screen="play"
            title="Play"
            action={
                <Link className="dk-button dk-button-text" href={hrefOf('about')}>
                    About
                </Link>
            }
        >
            {continuing ? (
                <section className="gtt-continue" aria-labelledby="continue">
                    <h2 id="continue" className="dk-eyebrow">
                        Game in play
                    </h2>
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
                </section>
            ) : null}
            <section className="gtt-start" aria-labelledby="start">
                <h2 id="start" className="dk-eyebrow">
                    Start a new game
                </h2>
                <ul className="gtt-games" role="list">
                    {GAMES.map((game) => (
                        <li key={game.id}>
                            <Link
                                className="gtt-game"
                                data-game={game.id}
                                href={newGameOf(game.id)}
                            >
                                <strong>{game.name}</strong>
                                <span>
                                    {cardOf(game.id).line} {playersOf(game)}.
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </section>
            <p className="gtt-fine">{NOT_AFFILIATED}</p>
        </AppFrame>
    );
};
