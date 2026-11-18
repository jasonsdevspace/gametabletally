import { GAMES } from '@gametabletally/scoring';
import { Button, StatusLine } from '@jasonsdevspace/design-kit/react';
import { type ReactNode, useState } from 'react';

import { Link, navigate } from '../navigation.js';
import type { GameInPlay, NewGame, Play } from '../play/play.js';
import { changingRoundOf, hrefOf } from '../routes.js';
import { refusalOf } from '../store/store.js';
import { listOf } from '../website/games.js';
import { Dock } from './AppFrame.js';
import { gameNameOf } from './in-play.js';
import { nameIn, type OpenedGameProps, useGame, WithOpenedGame } from './opened-game.js';
import { newGameOf } from './PlayStart.js';
import { GameTables } from './ScoresScreen.js';
import { useStatus } from './status.js';
import { useSummary } from './summary.js';

/*
 * The recap of a finished game, by its id, so the moment the rules end a game and a look back at it
 * later open the same page: who won, in words, then the final standings and every round, and a way
 * to play again with the same players in the same seats. The scoring package says when a game is
 * over and who won, so a tie the rules share is a shared win and one they play on is no end. A
 * round changed from here can put the game back in play, which the page then says.
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
}: {
    readonly standing: Standing;
    readonly id: string;
    readonly gameName: string;
    readonly names: ReadonlyMap<string, string>;
    readonly totals: Readonly<Record<string, number>>;
}): ReactNode => {
    if (standing.kind === 'over')
        return (
            <>
                <p className="gtt-winner">
                    {winnerWords(
                        standing.winners.map((one) => nameIn(names, one)),
                        totals[standing.winners[0] ?? ''] ?? 0
                    )}
                </p>
                <p>This game of {gameName} is over.</p>
            </>
        );
    if (standing.kind === 'changing')
        return (
            <p>
                Round {standing.round + 1} of this game of {gameName} is being changed.{' '}
                <Link href={changingRoundOf(id, standing.round, 'recap')}>
                    Go back to round {standing.round + 1}
                </Link>
                .
            </p>
        );
    return (
        <p>
            This game of {gameName} is in play, so it has no winner yet.{' '}
            <Link href={hrefOf('game', id)}>Go back to the game</Link>.
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
    const [line, say] = useStatus();
    const summary = useSummary(play);
    const [busy, setBusy] = useState(false);
    if (!game) return <p>This game is not on this phone.</p>;
    const { result, saved } = game;
    const standing = standingOf(game);

    /**
     * Starts a new game of the same kind, with the same players in the same seats, at its first
     * round, or, where too few of them are still on this phone, opens a new game of it to seat
     * others.
     */
    const again = async () => {
        if (busy) return;
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

    return (
        <div className="gtt-scores">
            <Head
                standing={standing}
                id={id}
                gameName={gameNameOf(saved.game)}
                names={names}
                totals={result.totals}
            />
            <GameTables
                play={play}
                id={id}
                names={names}
                game={game}
                from="recap"
                lead={standing.kind !== 'over'}
            />
            <StatusLine ref={line} />
            {standing.kind === 'over' ? (
                <Dock>
                    <Button accent tall off={busy} onClick={() => void again()}>
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
