import { Link } from '../navigation.js';
import type { Play } from '../play/play.js';
import { hrefOf } from '../routes.js';
import { useKeepAwake } from './awake.js';
import { Dock } from './frame-places.js';
import { GameTables } from './game-tables.js';
import { GameGone, type OpenedGameProps, useGame, WithOpenedGame } from './opened-game.js';

/*
 * The scores of a game in play: the standings first, ranked the way the game ranks, with who is
 * ahead said in words, then every player's score in every round, in the kit's table with the
 * players' names and totals pinned while the rounds scroll. A round still being entered shows what
 * stands so far, marked as not yet counted. The screen is opened from the dock of the round's
 * screen and goes back to it from its own.
 */

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
    const game = useGame(play, id);
    // The screen stays lit while the game is in play, and not once it is over.
    useKeepAwake(game !== undefined && game.draft !== null);
    if (!game) return <GameGone />;
    const { result, draft } = game;
    const back =
        draft !== null && draft.index === result.rounds.length
            ? `Back to round ${String(draft.index + 1)}`
            : 'Back to the game';
    return (
        <div className="gtt-scores">
            <GameTables play={play} id={id} names={names} game={game} from="scores" />
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
