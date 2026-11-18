import { GAMES } from '@gametabletally/scoring';
import { Button, StatusLine } from '@jasonsdevspace/design-kit/react';
import { useEffect, useSyncExternalStore } from 'react';

import { Link } from '../navigation.js';
import type { Play } from '../play/play.js';
import { hrefOf } from '../routes.js';
import { openStore, refusalOf, type Store } from '../store/store.js';
import { cardOf, playersOf } from '../website/games.js';
import { NOT_AFFILIATED } from '../website/Website.js';
import { type Continuing, inPlayOf } from './in-play.js';
import { WithGames } from './opened-game.js';
import { useStatus } from './status.js';
import { useSummary } from './summary.js';

/**
 * The start screen, where the app opens: every game in play, to continue or discard, and each game
 * to start a new one of. The games in play are read from the phone once the screen is running,
 * never in the prerender, so the prerendered page holds only what every visitor sees.
 */

/** Where starting a game of one kind leads: the new game screen, with the game picked. */
export const newGameOf = (game: string): string =>
    `${hrefOf('new')}?${new URLSearchParams({ game }).toString()}`;

/**
 * The games in play from the model the frame shares, each to continue or to discard. A discard is
 * at once, with the frame's toast offering Undo, as the app does in place of asking first. The
 * games are read again when the app comes back to the front, since one may have moved on in
 * another tab or ended there.
 */
const InPlay = ({
    play,
    names,
}: {
    readonly play: Play;
    readonly names: ReadonlyMap<string, string>;
}) => {
    const games = useSyncExternalStore(play.subscribe, play.snapshot, play.snapshot).games;
    const summary = useSummary(play);
    const [line, say] = useStatus();
    useEffect(() => {
        const again = () => {
            if (document.visibilityState === 'visible') void play.load();
        };
        document.addEventListener('visibilitychange', again);
        window.addEventListener('pageshow', again);
        return () => {
            document.removeEventListener('visibilitychange', again);
            window.removeEventListener('pageshow', again);
        };
    }, [play]);
    const shown = inPlayOf(games, names);

    const discard = async (game: Continuing) => {
        summary.clear();
        try {
            await play.discard(game.id);
            summary.offer(`The game of ${game.name} is discarded.`);
        } catch (error: unknown) {
            say(refusalOf(error) ?? 'The game could not be discarded. Try again.');
        }
    };

    return (
        <>
            {shown.length === 0 ? null : (
                <section className="gtt-in-play" aria-labelledby="in-play">
                    <h2 className="dk-eyebrow" id="in-play">
                        {shown.length === 1 ? 'Game in play' : 'Games in play'}
                    </h2>
                    <ul className="gtt-in-play-list" role="list">
                        {shown.map((game) => (
                            <li key={game.id} className="dk-panel dk-panel-raised gtt-continue">
                                <p className="gtt-continue-game">
                                    <strong>{game.name}</strong>
                                    <span>Round {game.round}</span>
                                </p>
                                <p>{game.turn}</p>
                                <Link
                                    className="dk-button dk-button-accent dk-button-tall"
                                    href={hrefOf('game', game.id)}
                                >
                                    Continue the game{' '}
                                    <span className="dk-visually-hidden">
                                        of {game.name}, round {game.round}
                                    </span>
                                </Link>
                                <Button text onClick={() => void discard(game)}>
                                    Discard{' '}
                                    <span className="dk-visually-hidden">
                                        the game of {game.name}, round {game.round}
                                    </span>
                                </Button>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            <StatusLine ref={line} />
        </>
    );
};

export const PlayStart = ({ open = openStore }: { readonly open?: () => Promise<Store> }) => (
    <>
        <WithGames open={open}>
            {({ play, names }) => <InPlay play={play} names={names} />}
        </WithGames>
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
