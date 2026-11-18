import { GAMES, type RoundResult } from '@gametabletally/scoring';
import { useSyncExternalStore } from 'react';

import { Link } from '../navigation.js';
import type { GameInPlay, Play } from '../play/play.js';
import { hrefOf } from '../routes.js';
import { Dock } from './AppFrame.js';
import { gameNameOf } from './in-play.js';
import { type OpenedGameProps, WithOpenedGame } from './opened-game.js';

/*
 * The scores of a game in play: the standings first, ranked the way the game ranks, with who is
 * ahead said in words, then every player's score in every round, in the kit's table with the
 * players' names and totals pinned while the rounds scroll. A round still being entered shows what
 * stands so far, marked as not yet counted. The screen is opened from the dock of the round's
 * screen and goes back to it from its own.
 */

/** A player's place in the standings, and whether another player shares it. */
export interface Standing {
    readonly player: string;
    readonly total: number;
    /** The place, from 1, which players level on a total share. */
    readonly place: number;
    readonly shared: boolean;
}

/**
 * The players ranked the way the game ranks, the highest total first or the lowest, with players
 * level on a total sharing a place and the next place counted past them, as 1, 1, 3. Players level
 * keep their seat order.
 */
export const standingsOf = (
    players: readonly string[],
    totals: Readonly<Record<string, number>>,
    ahead: 'highest' | 'lowest'
): Standing[] => {
    const totalOf = (player: string) => totals[player] ?? 0;
    const ranked = [...players].sort((first, second) =>
        ahead === 'highest' ? totalOf(second) - totalOf(first) : totalOf(first) - totalOf(second)
    );
    return ranked.map((player) => {
        const total = totalOf(player);
        const before = ranked.findIndex((other) => totalOf(other) === total);
        const level = ranked.filter((other) => totalOf(other) === total).length;
        return { player, total, place: before + 1, shared: level > 1 };
    });
};

/** A place in words, such as "1st", "2nd" or "11th". */
export const placeWords = (place: number): string => {
    const tens = place % 100;
    if (tens >= 11 && tens <= 13) return `${String(place)}th`;
    const last = place % 10;
    const ending = last === 1 ? 'st' : last === 2 ? 'nd' : last === 3 ? 'rd' : 'th';
    return `${String(place)}${ending}`;
};

/** Names in a sentence, such as "Ann", "Ann and Ben" or "Ann, Ben and Cat". */
const listed = (names: readonly string[]): string =>
    names.length < 2
        ? (names[0] ?? '')
        : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`;

/**
 * Who is ahead, in a sentence: the leaders the rules name, with their total, said as the lowest
 * where the lowest total leads, or that no round is counted yet.
 */
export const leadWords = ({
    leaders,
    total,
    ahead,
    counted,
}: {
    readonly leaders: readonly string[];
    readonly total: number;
    readonly ahead: 'highest' | 'lowest';
    readonly counted: boolean;
}): string => {
    if (!counted || leaders.length === 0) return 'No round is counted yet.';
    const lowest = ahead === 'lowest' ? ', the lowest total' : '';
    return leaders.length === 1
        ? `${listed(leaders)} leads with ${String(total)}${lowest}.`
        : `${listed(leaders)} lead, level on ${String(total)}${lowest}.`;
};

/** A column of the table: a round, what the rules made of it, and whether it is counted yet. */
interface Column {
    readonly index: number;
    readonly result: RoundResult;
    /** What each player has entered in a round still being entered, which a counted round needs not. */
    readonly entered: ReadonlySet<string> | null;
}

/**
 * The rounds as columns, newest first, as the drawing has them, since the latest round is the one
 * a table checks. A round being entered after the last saved one comes first, from what stands so
 * far.
 */
const columnsOf = (game: GameInPlay): Column[] => {
    const saved = game.result.rounds.map((result, index) => ({ index, result, entered: null }));
    const { draft } = game;
    const current = draft?.preview.rounds[draft.index];
    const entering =
        draft !== null && draft.index === saved.length && current !== undefined
            ? [
                  {
                      index: draft.index,
                      result: current,
                      entered: new Set(Object.keys(draft.round.entries)),
                  },
              ]
            : [];
    return [...saved, ...entering].reverse();
};

/** A player's score in a round, or why there is none, as the cell says it. */
const Cell = ({ column, player }: { readonly column: Column; readonly player: string }) => {
    const { result, entered } = column;
    if (result.out.includes(player))
        return <td className="dk-table-number gtt-score-quiet">Out</td>;
    const score = result.scores[player];
    if (score === undefined || (entered !== null && !entered.has(player)))
        return (
            <td className="dk-table-number gtt-score-quiet">
                <span className="dk-visually-hidden">Nothing yet</span>
            </td>
        );
    return <td className="dk-table-number">{score}</td>;
};

/** The scores of one game, drawn from the model as it stands. */
const Scores = ({
    play,
    id,
    names,
}: {
    readonly play: Play;
    readonly id: string;
    readonly names: ReadonlyMap<string, string>;
}) => {
    const snapshot = useSyncExternalStore(play.subscribe, play.snapshot, play.snapshot);
    const game = snapshot.games.find(({ saved }) => saved.id === id);
    if (!game) return <p>This game is not on this phone.</p>;
    const nameOf = (player: string) => names.get(player) ?? 'Another player';
    const { result, saved, draft } = game;
    const ahead = GAMES.find((one) => one.id === saved.game)?.ahead ?? 'highest';
    const standings = standingsOf(saved.players, result.totals, ahead);
    const counted = result.rounds.some((round) => round.state === 'scored');
    const columns = columnsOf(game);
    const back =
        draft !== null && draft.index === result.rounds.length
            ? `Back to round ${String(draft.index + 1)}`
            : 'Back to the game';
    return (
        <div className="gtt-scores">
            <section aria-labelledby="standings-title">
                <h2 id="standings-title">Standings</h2>
                <p>
                    {leadWords({
                        leaders: result.leaders.map(nameOf),
                        total: result.totals[result.leaders[0] ?? ''] ?? 0,
                        ahead,
                        counted,
                    })}
                </p>
                <ol className="dk-rows" role="list" aria-labelledby="standings-title">
                    {standings.map(({ player, total, place, shared }) => (
                        <li key={player}>
                            <div className="dk-row">
                                <span className="dk-row-text">
                                    <span className="dk-row-title">{nameOf(player)}</span>
                                    <span className="dk-visually-hidden">, </span>
                                    <span className="dk-row-detail">
                                        {shared ? 'Level for ' : ''}
                                        {placeWords(place)}
                                        {shared ? '' : ' place'}
                                    </span>
                                </span>
                                <span className="dk-visually-hidden">, </span>
                                <span className="dk-row-figure">
                                    {total}
                                    <span className="dk-visually-hidden"> points</span>
                                </span>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>
            <section aria-labelledby="rounds-title">
                <h2 id="rounds-title">By round</h2>
                {columns.length === 0 ? (
                    <p>No round of this game of {gameNameOf(saved.game)} is entered yet.</p>
                ) : (
                    <>
                        <p className="dk-table-title" id="scores-title">
                            Scores by round, newest first
                        </p>
                        <div
                            className="dk-table-scroll"
                            role="region"
                            aria-labelledby="scores-title"
                            tabIndex={0}
                        >
                            <table
                                className="dk-table dk-table-pinned"
                                aria-labelledby="scores-title"
                            >
                                <thead>
                                    <tr>
                                        <th scope="col">Player and total</th>
                                        {columns.map((column) => (
                                            <th
                                                key={column.index}
                                                scope="col"
                                                className="dk-table-number"
                                            >
                                                Round {column.index + 1}
                                                {column.result.state === 'scored' ? null : (
                                                    <span className="gtt-round-note">
                                                        {' '}
                                                        not yet counted
                                                    </span>
                                                )}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {saved.players.map((player) => (
                                        <tr key={player}>
                                            <th scope="row">
                                                {nameOf(player)}
                                                <span className="dk-visually-hidden">, </span>
                                                <span className="gtt-row-total">
                                                    {result.totals[player] ?? 0}
                                                    <span className="dk-visually-hidden">
                                                        {' '}
                                                        in all
                                                    </span>
                                                </span>
                                            </th>
                                            {columns.map((column) => (
                                                <Cell
                                                    key={column.index}
                                                    column={column}
                                                    player={player}
                                                />
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>
            <Dock>
                <Link
                    className="dk-button dk-button-accent dk-button-tall"
                    href={hrefOf('game', id)}
                >
                    {back}
                </Link>
            </Dock>
        </div>
    );
};

export type ScoresScreenProps = OpenedGameProps;

/** The scores of the game named by the address, read once the screen is running. */
export const ScoresScreen = (props: ScoresScreenProps) => (
    <WithOpenedGame {...props}>
        {({ id, play, names }) => <Scores play={play} id={id} names={names} />}
    </WithOpenedGame>
);
