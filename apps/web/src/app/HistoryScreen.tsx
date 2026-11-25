import { useSyncExternalStore } from 'react';

import { Link } from '../navigation.js';
import type { Play } from '../play/play.js';
import { hrefOf } from '../routes.js';
import { openStore, type Store } from '../store/store.js';
import { finishedOf } from './history.js';
import { WithGames } from './opened-game.js';

/**
 * The history: every finished game, the newest first, each a row that opens its recap and says who
 * won, the game, the day and the players. A game is deleted from its recap, which comes back here
 * with the frame's toast offering Undo, so a row is one link, as the design kit's rows are. The
 * games are read once the screen is running, never in the prerender, and who won is worked out
 * from each game's rounds as they are read.
 */

export interface HistoryScreenProps {
    /** Opens the phone's database, which a test opens in memory. */
    readonly open?: () => Promise<Store>;
    /** Writes a game's date, in the visitor's own form unless a test gives one. */
    readonly dates?: Intl.DateTimeFormat;
}

/** The finished games from the model the frame shares, kept in step with a delete and its Undo. */
const Finished = ({
    play,
    names,
    dates,
}: {
    readonly play: Play;
    readonly names: ReadonlyMap<string, string>;
    readonly dates: Intl.DateTimeFormat;
}) => {
    const games = useSyncExternalStore(play.subscribe, play.snapshot, play.snapshot).games;
    const listed = finishedOf(games, names, dates);
    if (listed.length === 0)
        return (
            <div className="dk-empty">
                <p>
                    No finished games yet. Each game is listed here once it ends, with its players
                    and who won.
                </p>
                <Link className="dk-button" href={hrefOf('play')}>
                    Start a game
                </Link>
            </div>
        );
    return (
        <ul className="dk-rows" role="list" aria-label="Finished games">
            {listed.map((game) => (
                <li key={game.id}>
                    <Link className="dk-row" href={hrefOf('recap', game.id)}>
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

const visitorDates = () => new Intl.DateTimeFormat(undefined, { dateStyle: 'long' });

export const HistoryScreen = ({ open = openStore, dates }: HistoryScreenProps) => (
    <WithGames open={open}>
        {({ play, names }) => (
            <Finished play={play} names={names} dates={dates ?? visitorDates()} />
        )}
    </WithGames>
);
