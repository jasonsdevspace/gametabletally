import { GAMES, type RoundResult } from '@gametabletally/scoring';
import { attachTable } from '@jasonsdevspace/design-kit/controls';
import { Button, StatusLine } from '@jasonsdevspace/design-kit/react';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { Link, navigate, usePlace } from '../navigation.js';
import type { GameInPlay, Play } from '../play/play.js';
import { changingRoundOf, hrefOf, roundIn } from '../routes.js';
import { listOf } from '../website/games.js';
import { Dock } from './AppFrame.js';
import { canEnter, gameNameOf } from './in-play.js';
import { nameIn, type OpenedGameProps, WithOpenedGame } from './opened-game.js';
import { useStatus } from './status.js';
import { useSummary } from './summary.js';

/*
 * The scores of a game in play: the standings first, ranked the way the game ranks, with who is
 * ahead said in words, then every player's score in every round, in the kit's table with the
 * players' names and totals pinned while the rounds scroll. A round still being entered shows what
 * stands so far, marked as not yet counted. The screen is opened from the dock of the round's
 * screen and goes back to it from its own.
 */

/** A player's place in the standings, whether another player shares it, and whether they missed a round. */
export interface Standing {
    readonly player: string;
    readonly total: number;
    /** The place, from 1, which players level on a total share. */
    readonly place: number;
    readonly shared: boolean;
    /** Whether the player missed a scored round, so the rules rank them behind those who did not. */
    readonly missed: boolean;
}

/**
 * The players ranked as the rules rank them: those who missed no scored round first, as the rules
 * let only them lead or win while any of them is left, then those who did, each group the highest
 * total first or the lowest, as the game ranks. Players level on a total share a place and the next
 * place is counted past them, as 1, 1, 3. Players level keep their seat order.
 */
export const standingsOf = (
    players: readonly string[],
    totals: Readonly<Record<string, number>>,
    ahead: 'highest' | 'lowest',
    missed: readonly string[] = []
): Standing[] => {
    const totalOf = (player: string) => totals[player] ?? 0;
    // Where every player has missed a round, none is held behind another for it.
    const behind = (player: string) =>
        missed.includes(player) && !players.every((one) => missed.includes(one));
    const byTotal = (first: string, second: string) =>
        ahead === 'highest' ? totalOf(second) - totalOf(first) : totalOf(first) - totalOf(second);
    const ranked = [...players].sort(
        (first, second) => Number(behind(first)) - Number(behind(second)) || byTotal(first, second)
    );
    const keyOf = (player: string) => `${String(behind(player))}|${String(totalOf(player))}`;
    const level = new Map<string, number>();
    for (const player of ranked) level.set(keyOf(player), (level.get(keyOf(player)) ?? 0) + 1);
    let place = 0;
    let last = '';
    return ranked.map((player, at) => {
        if (keyOf(player) !== last) place = at + 1;
        last = keyOf(player);
        return {
            player,
            total: totalOf(player),
            place,
            shared: (level.get(keyOf(player)) ?? 0) > 1,
            missed: behind(player),
        };
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

/** A total's unit, one point or several. */
const pointsOf = (total: number): string => (Math.abs(total) === 1 ? 'point' : 'points');

/**
 * Who is ahead, in a sentence: the winners once the game is over, or the leaders the rules name,
 * with their total, said as the lowest where the lowest total leads, or that no round is counted
 * yet.
 */
export const leadWords = ({
    leaders,
    total,
    ahead,
    counted,
    over = false,
}: {
    readonly leaders: readonly string[];
    readonly total: number;
    readonly ahead: 'highest' | 'lowest';
    readonly counted: boolean;
    readonly over?: boolean;
}): string => {
    if (!counted || leaders.length === 0) return 'No round is counted yet.';
    const lowest = ahead === 'lowest' ? ', the lowest total' : '';
    const names = listOf(leaders, 'and');
    if (over)
        return leaders.length === 1
            ? `${names} won with ${String(total)}${lowest}.`
            : `${names} won together, level on ${String(total)}${lowest}.`;
    return leaders.length === 1
        ? `${names} leads with ${String(total)}${lowest}.`
        : `${names} lead, level on ${String(total)}${lowest}.`;
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
                      // The player whose turn it is holds a hand still being tapped, not entered.
                      entered: new Set(
                          Object.keys(draft.round.entries).filter(
                              (player) => player !== draft.step?.player
                          )
                      ),
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
    const waiting = entered !== null && !entered.has(player);
    if (score === undefined || waiting)
        return (
            <td className="dk-table-number gtt-score-quiet">
                <span className="dk-visually-hidden">{waiting ? 'Nothing yet' : 'No score'}</span>
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
    const [line, say] = useStatus();
    const summary = useSummary(play);
    const { search } = usePlace();
    const arrivedFrom = roundIn(search);
    const frame = useRef<HTMLDivElement>(null);
    const loaded = snapshot.games.some(({ saved }) => saved.id === id);
    // A frame whose headings hold buttons brings the one the keyboard reaches clear of the pinned
    // column, and a screen arrived at from a round it changed puts focus back on that round's
    // heading.
    useEffect(() => {
        const element = frame.current;
        if (!loaded || element === null) return undefined;
        const detach = attachTable(element);
        if (arrivedFrom !== null) document.getElementById(`round-${String(arrivedFrom)}`)?.focus();
        return detach;
    }, [loaded, arrivedFrom]);

    /**
     * Opens a saved round on its entry screen, filled with what was entered, to change it, in the
     * scores' place, so the scores it goes back to are the one place in the history. A summary
     * from an earlier save goes first, since its Undo would reach past the round opened.
     */
    const change = async (index: number) => {
        summary.clear();
        try {
            await play.reopen(id, index);
            navigate(changingRoundOf(id, index), { replace: true });
        } catch (error: unknown) {
            say(
                error instanceof Error
                    ? error.message
                    : `Round ${String(index + 1)} could not be opened.`
            );
        }
    };
    const game = snapshot.games.find(({ saved }) => saved.id === id);
    if (!game) return <p>This game is not on this phone.</p>;
    const nameOf = (player: string) => nameIn(names, player);
    const { result, saved, draft } = game;
    const ahead = GAMES.find((one) => one.id === saved.game)?.ahead ?? 'highest';
    const counted = result.rounds.some((round) => round.state === 'scored');
    const over = result.state === 'over';
    const shown = over ? result.winners : result.leaders;
    // Before a round is counted no one has a place, so the players keep their seats.
    const standings = counted
        ? standingsOf(saved.players, result.totals, ahead, result.missed)
        : saved.players.map((player) => ({
              player,
              total: 0,
              place: 0,
              shared: false,
              missed: false,
          }));
    const columns = columnsOf(game);
    // A round opens only on a screen its game has for entering one.
    const enterable = canEnter(saved.game);
    const back =
        draft !== null && draft.index === result.rounds.length
            ? `Back to round ${String(draft.index + 1)}`
            : 'Back to the game';
    return (
        <div className="gtt-scores">
            <section>
                <h2 id="standings-title">Standings</h2>
                <p>
                    {leadWords({
                        leaders: shown.map(nameOf),
                        total: result.totals[shown[0] ?? ''] ?? 0,
                        ahead,
                        counted,
                        over,
                    })}
                </p>
                <ol className="dk-rows" role="list" aria-labelledby="standings-title">
                    {standings.map(({ player, total, place, shared, missed }) => (
                        <li key={player}>
                            <div className="dk-row">
                                <span className="dk-row-text">
                                    <span className="dk-row-title">{nameOf(player)}</span>
                                    {place === 0 ? null : (
                                        <>
                                            <span className="dk-visually-hidden">, </span>
                                            <span className="dk-row-detail">
                                                {shared ? 'Level for ' : ''}
                                                {placeWords(place)}
                                                {shared ? '' : ' place'}
                                                {missed ? ', missed a round' : ''}
                                            </span>
                                        </>
                                    )}
                                </span>
                                <span className="dk-visually-hidden">, </span>
                                <span className="dk-row-figure">
                                    {total}
                                    <span className="dk-visually-hidden"> {pointsOf(total)}</span>
                                </span>
                            </div>
                        </li>
                    ))}
                </ol>
            </section>
            <section>
                <h2>By round</h2>
                {columns.length === 0 ? (
                    <p>No round of this game of {gameNameOf(saved.game)} is entered yet.</p>
                ) : (
                    <>
                        <p className="dk-table-title" id="scores-title">
                            Scores by round, newest first
                        </p>
                        <div
                            ref={frame}
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
                                                {column.entered === null && enterable ? (
                                                    <Button
                                                        text
                                                        id={`round-${String(column.index + 1)}`}
                                                        onClick={() => void change(column.index)}
                                                    >
                                                        <span className="dk-visually-hidden">
                                                            Change{' '}
                                                        </span>
                                                        Round {column.index + 1}
                                                    </Button>
                                                ) : (
                                                    <>Round {column.index + 1}</>
                                                )}
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
            <StatusLine ref={line} />
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
