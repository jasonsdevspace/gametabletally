import { GAMES } from '@gametabletally/scoring';
import { Button, StatusLine } from '@jasonsdevspace/design-kit/react';
import { useState, useSyncExternalStore } from 'react';

import { Link, navigate } from '../navigation.js';
import type { Play } from '../play/play.js';
import { hrefOf } from '../routes.js';
import { listOf } from '../website/games.js';
import { Dock } from './AppFrame.js';
import { gameNameOf } from './in-play.js';
import { nameIn, type OpenedGameProps, WithOpenedGame } from './opened-game.js';
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

/** Who won, in a sentence, alone or sharing the win, with their total. */
export const winnerWords = (winners: readonly string[], total: number): string =>
    winners.length === 1
        ? `${listOf(winners, 'and')} wins with ${String(total)}.`
        : `${listOf(winners, 'and')} share the win, level on ${String(total)}.`;

/** The recap of one game, drawn from the model as it stands. */
const Recap = ({
    play,
    id,
    names,
    newId,
}: {
    readonly play: Play;
    readonly id: string;
    readonly names: ReadonlyMap<string, string>;
    readonly newId: () => string;
}) => {
    const snapshot = useSyncExternalStore(play.subscribe, play.snapshot, play.snapshot);
    const [line, say] = useStatus();
    const summary = useSummary(play);
    const [busy, setBusy] = useState(false);
    const game = snapshot.games.find(({ saved }) => saved.id === id);
    if (!game) return <p>This game is not on this phone.</p>;
    const { result, saved } = game;
    const gameName = gameNameOf(saved.game);

    /** Starts a new game of the same kind, with the same players in the same seats, at its first round. */
    const again = async () => {
        if (busy) return;
        summary.clear();
        setBusy(true);
        const fresh = newId();
        try {
            await play.start({
                id: fresh,
                game: saved.game,
                rules: GAMES.find((one) => one.id === saved.game)?.rules ?? saved.rules,
                options: saved.options,
                players: saved.players,
            });
            navigate(hrefOf('game', fresh));
        } catch (error: unknown) {
            say(error instanceof Error ? error.message : 'A new game could not be started.');
        } finally {
            setBusy(false);
        }
    };

    if (result.state !== 'over')
        return (
            <div className="gtt-scores">
                <p>
                    This game of {gameName} is in play, so it has no winner yet.{' '}
                    <Link href={hrefOf('game', id)}>Go back to the game</Link>.
                </p>
                <GameTables play={play} id={id} names={names} game={game} from="recap" />
            </div>
        );
    return (
        <div className="gtt-scores">
            <p className="gtt-winner">
                {winnerWords(
                    result.winners.map((one) => nameIn(names, one)),
                    result.totals[result.winners[0] ?? ''] ?? 0
                )}
            </p>
            <p>This game of {gameName} is over.</p>
            <GameTables play={play} id={id} names={names} game={game} from="recap" lead={false} />
            <StatusLine ref={line} />
            <Dock>
                <Button accent tall off={busy} onClick={() => void again()}>
                    Play again <span className="dk-visually-hidden">with the same players</span>
                </Button>
            </Dock>
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
        {({ id, play, names }) => <Recap play={play} id={id} names={names} newId={newId} />}
    </WithOpenedGame>
);
