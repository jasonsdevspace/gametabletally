import { useId, useMemo } from 'react';

import { Link } from '../navigation.js';
import { hrefOf } from '../routes.js';
import type { SavedGame } from '../store/format.js';
import { listOf } from '../website/games.js';
import { hasGameInPlay, recordOf, rounded } from './record.js';

/*
 * A player's record on their page: a row for each game they have finished, with how many they
 * played and won, their best total and their average, worked out from the saved games as the page
 * draws and never saved. A player who has finished no game is told what will appear there instead,
 * and a player in a game that has yet to end is told it counts once it ends.
 */

const IN_PLAY = 'A game in play counts once it ends.';

export interface PlayerRecordProps {
    readonly player: { readonly id: string; readonly name: string };
    /** Every saved game, in play or finished. */
    readonly games: readonly SavedGame[];
}

/** The columns of figures, in the order each row gives them. */
const FIGURES = ['Played', 'Won', 'Best', 'Average'];

export const PlayerRecord = ({ player, games }: PlayerRecordProps) => {
    const title = useId();
    const note = useId();
    const record = useMemo(() => recordOf(games, player.id), [games, player.id]);
    const playing = useMemo(() => hasGameInPlay(games, player.id), [games, player.id]);
    if (record.length === 0) {
        return (
            <div className="dk-empty">
                <p>
                    No finished games yet. Once {player.name} finishes a game, how many{' '}
                    {player.name} has played and won, the best total and the average show here, game
                    by game.{playing ? ` ${IN_PLAY}` : null}
                </p>
                <Link className="dk-button" href={hrefOf('play')}>
                    Start a game
                </Link>
            </div>
        );
    }
    const lowest = record.filter(({ ahead }) => ahead === 'lowest').map(({ name }) => name);
    return (
        <div className="dk-stack dk-stack-pair">
            <p className="dk-table-title" id={title}>
                Record
            </p>
            <div className="dk-table-scroll" role="region" aria-labelledby={title} tabIndex={0}>
                <table
                    className="dk-table dk-table-pinned"
                    aria-labelledby={title}
                    aria-describedby={lowest.length === 0 ? undefined : note}
                >
                    <thead>
                        <tr>
                            <th scope="col">Game</th>
                            {FIGURES.map((figure) => (
                                <th key={figure} scope="col" className="dk-table-number">
                                    {figure}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {record.map((one) => (
                            <tr key={one.game}>
                                <th scope="row">{one.name}</th>
                                {[one.played, one.won, one.best, rounded(one.average)].map(
                                    (figure, at) => (
                                        <td key={FIGURES[at]} className="dk-table-number">
                                            {figure}
                                        </td>
                                    )
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {lowest.length === 0 ? null : (
                <p className="dk-note" id={note}>
                    In {listOf(lowest, 'and')} the lowest total wins, so the best there is the
                    lowest.
                </p>
            )}
            {playing ? <p className="dk-note">{IN_PLAY}</p> : null}
        </div>
    );
};
