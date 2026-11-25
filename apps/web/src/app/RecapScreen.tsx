import { GAMES } from '@gametabletally/scoring';
import { Button, useBusy, useStatus } from '@jasonsdevspace/design-kit/react';
import { type ReactNode, useState } from 'react';

import { Link, navigate, usePlace } from '../navigation.js';
import type { GameInPlay, NewGame, Play } from '../play/play.js';
import { changingRoundOf, fromHistory, hrefOf, newGameOf } from '../routes.js';
import { refusalOf } from '../store/store.js';
import { listOf } from '../website/games.js';
import { Dock } from './frame-places.js';
import { GameTables } from './game-tables.js';
import { visitorFormats } from './history.js';
import { gameNameOf } from './in-play.js';
import { GameGone, nameIn, type OpenedGameProps, useGame, WithOpenedGame } from './opened-game.js';
import { playedWith } from './options.js';
import { useDiscard, useSummary } from './summary.js';

/*
 * The recap of a finished game, by its id, so the moment the rules end a game and a look back at it
 * later open the same page: who won, in words, any rule option that differed from the published
 * rules, then the final standings and every round, and a way to play again with the same players
 * in the same seats. The scoring package says when a game is over and who won, so a tie the rules
 * share is a shared win and one they play on is no end. A round changed from here can put the game
 * back in play, which the page then says. A finished game is deleted from here at once, and the
 * page gives way to the history, where the frame's toast offers Undo.
 */

/** Who won, in a sentence, alone or sharing the win, with their total, or that no one did. */
export const winnerWords = (winners: readonly string[], total: number): string => {
    if (winners.length === 0) return 'The game is over, and the rules name no winner.';
    return winners.length === 1
        ? `${listOf(winners, 'and')} wins with ${String(total)}.`
        : `${listOf(winners, 'and')} share the win, level on ${String(total)}.`;
};

/** Where a game stands, as the recap tells it. */
type Standing =
    | { readonly kind: 'over'; readonly winners: readonly string[] }
    | { readonly kind: 'changing'; readonly round: number }
    | { readonly kind: 'in-play' };

/** Where a game stands: a round opened to change, over with its winners, or in play. */
const standingOf = (game: GameInPlay): Standing => {
    const { draft, result, saved } = game;
    if (draft !== null && draft.index < saved.rounds.length)
        return { kind: 'changing', round: draft.index };
    if (result.state === 'over') return { kind: 'over', winners: result.winners };
    return { kind: 'in-play' };
};

/**
 * The game played again: the same kind, with the players of its seats this phone still holds, in
 * the same order. Its rules are the game's newest, and its options are kept where the rules are the
 * ones they were chosen under, and left to the rules' own where those are newer.
 */
export const againOf = (
    game: GameInPlay['saved'],
    present: ReadonlySet<string>,
    id: string
): NewGame => {
    const rules = GAMES.find((one) => one.id === game.game)?.rules ?? game.rules;
    return {
        id,
        game: game.game,
        rules,
        options: rules === game.rules ? game.options : {},
        players: game.players.filter((player) => present.has(player)),
    };
};

/** The words at the head of the recap, for where the game stands. */
const Head = ({
    standing,
    id,
    gameName,
    names,
    totals,
    rules,
}: {
    readonly standing: Standing;
    readonly id: string;
    readonly gameName: string;
    readonly names: ReadonlyMap<string, string>;
    readonly totals: Readonly<Record<string, number>>;
    /** The options it was played with that differ from the published rules, or nothing. */
    readonly rules: string;
}): ReactNode => {
    const played = rules === '' ? null : ` ${rules}`;
    if (standing.kind === 'over')
        return (
            <>
                <p className="gtt-winner">
                    {winnerWords(
                        standing.winners.map((one) => nameIn(names, one)),
                        totals[standing.winners[0] ?? ''] ?? 0
                    )}
                </p>
                <p>
                    This game of {gameName} is over.{played}
                </p>
            </>
        );
    if (standing.kind === 'changing')
        return (
            <p>
                Round {standing.round + 1} of this game of {gameName} is being changed.{' '}
                <Link href={changingRoundOf(id, standing.round, 'recap')}>
                    Go back to round {standing.round + 1}
                </Link>
                .{played}
            </p>
        );
    return (
        <p>
            This game of {gameName} is in play, so it has no winner yet.{' '}
            <Link href={hrefOf('game', id)}>Go back to the game</Link>.{played}
        </p>
    );
};

/** The recap of one game, drawn from the model as it stands. */
const Recap = ({
    play,
    id,
    names,
    present,
    newId,
}: {
    readonly play: Play;
    readonly id: string;
    readonly names: ReadonlyMap<string, string>;
    readonly present: ReadonlySet<string>;
    readonly newId: () => string;
}) => {
    const game = useGame(play, id);
    const { search } = usePlace();
    const say = useStatus();
    const summary = useSummary(play);
    const [busy, setBusy] = useState(false);
    const againButton = useBusy<HTMLButtonElement>();
    const [deleteGame, deleting] = useDiscard(play, 'deleted');
    const deleteButton = useBusy<HTMLButtonElement>();
    // Set as a delete starts, so the page says nothing of the game it took away while it goes.
    const [leaving, setLeaving] = useState(false);
    if (!game) return leaving ? null : <GameGone />;
    const { result, saved } = game;
    const standing = standingOf(game);

    /**
     * Starts a new game of the same kind, with the same players in the same seats, at its first
     * round, or, where too few of them are still on this phone, opens a new game of it to seat
     * others.
     */
    const again = async () => {
        if (leaving) return;
        summary.clear();
        const fresh = againOf(saved, present, newId());
        const least = GAMES.find((one) => one.id === saved.game)?.minPlayers ?? 0;
        if (fresh.players.length < least) {
            navigate(newGameOf(saved.game));
            return;
        }
        setBusy(true);
        try {
            await play.start(fresh);
            // A start the store refused leaves the game in memory alone, so it is said and not
            // played on.
            const refused = play.snapshot().games.find((one) => one.saved.id === fresh.id)?.error;
            if (refused === null || refused === undefined) navigate(hrefOf('game', fresh.id));
            else say(refused);
        } catch (error: unknown) {
            say(refusalOf(error) ?? 'The game could not be started. Try again.');
        } finally {
            setBusy(false);
        }
    };

    /**
     * Deletes the game at once and goes to the history in this page's place, so Back does not lead
     * to a game that is gone, with the frame's toast offering Undo there.
     */
    const remove = async () => {
        if (busy) return;
        setLeaving(true);
        const day = visitorFormats().date.format(new Date(saved.started));
        const done = await deleteGame(id, gameNameOf(saved.game), day);
        if (done === true) {
            // Opened from the history, the recap goes back to it, so Back never shows it twice.
            if (fromHistory(search)) window.history.back();
            else navigate(hrefOf('history'), { replace: true });
            return;
        }
        setLeaving(false);
        if (done !== null) say(done);
    };

    return (
        <div className="gtt-scores">
            <Head
                standing={standing}
                id={id}
                gameName={gameNameOf(saved.game)}
                names={names}
                totals={result.totals}
                rules={playedWith(saved)}
            />
            <GameTables
                play={play}
                id={id}
                names={names}
                game={game}
                from="recap"
                lead={standing.kind !== 'over'}
            />
            {standing.kind === 'over' ? (
                <p className="dk-actions">
                    <Button
                        ref={deleteButton}
                        text
                        off={busy}
                        busy={deleting === null ? false : 'Deleting the game.'}
                        onClick={() => void remove()}
                    >
                        Delete this game
                    </Button>
                </p>
            ) : null}
            {standing.kind === 'over' ? (
                <Dock>
                    <Button
                        ref={againButton}
                        accent
                        tall
                        busy={busy ? 'Starting the game.' : false}
                        off={leaving || deleting !== null}
                        onClick={() => void again()}
                    >
                        Play again <span className="dk-visually-hidden">with the same players</span>
                    </Button>
                </Dock>
            ) : null}
        </div>
    );
};

export interface RecapScreenProps extends OpenedGameProps {
    /** Makes the id of a game played again. */
    readonly newId?: () => string;
}

const randomId = () => crypto.randomUUID();

/** The recap of the game named by the address, read once the screen is running. */
export const RecapScreen = ({ newId = randomId, ...props }: RecapScreenProps) => (
    <WithOpenedGame {...props}>
        {({ id, play, names, present }) => (
            <Recap play={play} id={id} names={names} present={present} newId={newId} />
        )}
    </WithOpenedGame>
);
