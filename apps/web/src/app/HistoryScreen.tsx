import { useMemo, useSyncExternalStore } from 'react';

import { Link } from '../navigation.js';
import type { Play } from '../play/play.js';
import { hrefOf, recapFromHistory } from '../routes.js';
import { openStore, type Store } from '../store/store.js';
import { type DateFormats, finishedOf, visitorFormats } from './history.js';
import { inPlayOf } from './in-play.js';
import { WithGames } from './opened-game.js';

/**
 * The history: every finished game, the newest first, each a row that opens its recap and says who
 * won and by what total, the game, the day and the players. A game is deleted from its recap, which
 * comes back here with the frame's toast offering Undo, so a row is one link, as the design kit's
 * rows are. The games are read once the screen is running, never in the prerender, and who won is
 * worked out from each game's rounds as they are read.
 */

export interface HistoryScreenProps {
    /** Opens the phone's database, which a test opens in memory. */
    readonly open?: () => Promise<Store>;
    /** Writes a game's date and time, in the visitor's own form unless a test gives one. */
    readonly formats?: DateFormats;
}

/** The finished games from the model the frame shares, kept in step with a delete and its Undo. */
const Finished = ({
    play,
    names,
    formats,
}: {
    readonly play: Play;
    readonly names: ReadonlyMap<string, string>;
    readonly formats: DateFormats;
}) => {
    const games = useSyncExternalStore(play.subscribe, play.snapshot, play.snapshot).games;
    const listed = useMemo(() => finishedOf(games, names, formats), [games, names, formats]);
    if (listed.length === 0) {
        // A game in play is on the Play screen, which the empty history points to in its place.
        const playing = inPlayOf(games, names).length;
        return (
            <div className="dk-empty">
                <p>
                    No finished games yet. Each game is listed here once it ends, with its players
                    and who won.
                    {playing === 0
                        ? null
                        : playing === 1
                          ? ' Your game in play is on the Play screen.'
                          : ' Your games in play are on the Play screen.'}
                </p>
                <Link className="dk-button" href={hrefOf('play')}>
                    {playing === 0 ? 'Start a game' : 'Go to Play'}
                </Link>
            </div>
        );
    }
    return (
        <ul className="dk-rows" role="list" aria-label="Finished games">
            {listed.map((game) => (
                <li key={game.id}>
                    <Link className="dk-row" href={recapFromHistory(game.id)}>
                        <span className="dk-row-text">
                            <span className="dk-row-title">{game.won}</span>
                            <span className="dk-visually-hidden">, </span>
                            <span className="dk-row-detail">
                                {game.game}, {game.date}. {game.players}.
                            </span>
                        </span>
                        <span className="dk-row-sign" aria-hidden="true">
                            ›
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    );
};

export const HistoryScreen = ({ open = openStore, formats }: HistoryScreenProps) => (
    <WithGames open={open}>
        {({ play, names }) => (
            <Finished play={play} names={names} formats={formats ?? visitorFormats()} />
        )}
    </WithGames>
);
