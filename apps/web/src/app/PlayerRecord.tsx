import { useMemo } from 'react';

import { Link } from '../navigation.js';
import { hrefOf } from '../routes.js';
import type { SavedGame } from '../store/format.js';
import { listOf } from '../website/games.js';
import { recordOf } from './record.js';

/*
 * A player's record on their page: a row for each game they have finished, with how many they
 * played and won, their best total and their average, worked out from the saved games as the page
 * draws and never saved. A player who has finished no game is told what will appear there instead.
 */

export interface PlayerRecordProps {
    readonly player: { readonly id: string; readonly name: string };
    /** Every saved game, in play or finished. */
    readonly games: readonly SavedGame[];
}

const TITLE = 'player-record-title';

/** The columns of figures, in the order each row gives them. */
const FIGURES = ['Played', 'Won', 'Best', 'Average'];

export const PlayerRecord = ({ player, games }: PlayerRecordProps) => {
    const record = useMemo(() => recordOf(games, player.id), [games, player.id]);
    if (record.length === 0) {
        const playing = games.some((game) => game.players.includes(player.id));
        return (
            <div className="dk-empty">
                <p>
                    No finished games yet. Once {player.name} finishes a game, its games played and
                    won, best total and average show here.
                    {playing ? ' A game in play counts once it ends.' : null}
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
            <p className="dk-table-title" id={TITLE}>
                Record
            </p>
            <div className="dk-table-scroll" role="region" aria-labelledby={TITLE} tabIndex={0}>
                <table className="dk-table" aria-labelledby={TITLE}>
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
                                {[one.played, one.won, one.best, Math.round(one.average)].map(
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
                <p className="dk-note">
                    In {listOf(lowest, 'and')} the lowest total wins, so the best there is the
                    lowest.
                </p>
            )}
        </div>
    );
};
