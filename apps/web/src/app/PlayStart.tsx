import { GAMES } from '@gametabletally/scoring';
import { Button, useBusy, useStatus } from '@jasonsdevspace/design-kit/react';
import { useEffect, useSyncExternalStore } from 'react';

import { Link } from '../navigation.js';
import type { Play } from '../play/play.js';
import { changingRoundOf, hrefOf, newGameOf } from '../routes.js';
import { openStore, refusalOf, type Store } from '../store/store.js';
import { cardOf, playersOf } from '../website/games.js';
import { NOT_AFFILIATED } from '../website/Website.js';
import { fetchGameAhead } from './entries.js';
import { type Continuing, inPlayOf } from './in-play.js';
import { WithGames } from './opened-game.js';
import { useDiscard } from './summary.js';

/**
 * The start screen, where the app opens: every game in play, to continue or discard, and each game
 * to start a new one of. The games in play are read from the phone once the screen is running,
 * never in the prerender, so the prerendered page holds only what every visitor sees.
 */

/**
 * One game in play, to continue or discard. A game with a saved round opened to change is
 * continued at that round, and what is let go is the change, never the game, as the round's own
 * screen offers only Cancel then.
 */
const GamePanel = ({
    game,
    discarding,
    onDiscard,
    onLetGo,
}: {
    readonly game: Continuing;
    /** Whether the game is being discarded, while its Discard is busy. */
    readonly discarding: boolean;
    readonly onDiscard: () => void;
    readonly onLetGo: () => void;
}) => {
    const discardButton = useBusy<HTMLButtonElement>();
    // What the game moves between is fetched as it is offered, so continuing it never waits.
    useEffect(() => {
        fetchGameAhead(game.game);
    }, [game.game]);
    return (
        <li className="dk-panel dk-panel-raised gtt-continue">
            <p className="dk-split gtt-continue-game">
                <strong>{game.name}</strong>
                <span className="dk-note gtt-continue-round">Round {game.round}</span>
            </p>
            <p>
                {game.changing === null
                    ? game.turn
                    : `Round ${String(game.round)} is being changed.`}
            </p>
            {game.changing === null ? (
                <>
                    <Link
                        className="dk-button dk-button-accent dk-button-tall"
                        href={hrefOf('game', game.id)}
                    >
                        Continue the game{' '}
                        <span className="dk-visually-hidden">
                            of {game.name}, round {game.round}
                        </span>
                    </Link>
                    <Button
                        ref={discardButton}
                        text
                        busy={discarding ? 'Discarding the game.' : false}
                        onClick={onDiscard}
                    >
                        Discard{' '}
                        <span className="dk-visually-hidden">
                            the game of {game.name}, round {game.round}
                        </span>
                    </Button>
                </>
            ) : (
                <>
                    <Link
                        className="dk-button dk-button-accent dk-button-tall"
                        href={changingRoundOf(game.id, game.changing)}
                    >
                        Continue changing round {game.round}{' '}
                        <span className="dk-visually-hidden">of {game.name}</span>
                    </Link>
                    <Button text onClick={onLetGo}>
                        Cancel the change{' '}
                        <span className="dk-visually-hidden">
                            to round {game.round} of {game.name}
                        </span>
                    </Button>
                </>
            )}
        </li>
    );
};

/**
 * The games in play from the model the frame shares, each to continue or to discard. A discard is
 * at once, with the frame's toast offering Undo, as the app does in place of asking first.
 */
const InPlay = ({
    play,
    names,
}: {
    readonly play: Play;
    readonly names: ReadonlyMap<string, string>;
}) => {
    const games = useSyncExternalStore(play.subscribe, play.snapshot, play.snapshot).games;
    const [discard, discarding] = useDiscard(play);
    const say = useStatus();
    const shown = inPlayOf(games, names);

    const discardGame = async (game: Continuing) => {
        const done = await discard(game.id, game.name);
        if (typeof done === 'string') say(done);
    };

    /** Lets a round's change go, leaving the game as it was saved. */
    const letGo = async (game: Continuing) => {
        try {
            await play.dropDraft(game.id);
            say(`The change to round ${String(game.round)} of ${game.name} is let go.`);
        } catch (error: unknown) {
            say(refusalOf(error) ?? 'The change could not be let go. Try again.');
        }
    };

    return (
        <>
            {shown.length === 0 ? null : (
                <section
                    className="dk-stack dk-stack-heading gtt-in-play"
                    aria-labelledby="in-play"
                >
                    <h2 className="dk-eyebrow" id="in-play">
                        {shown.length === 1 ? 'Game in play' : 'Games in play'}
                    </h2>
                    <ul className="dk-stack" role="list">
                        {shown.map((game) => (
                            <GamePanel
                                key={game.id}
                                game={game}
                                discarding={discarding === game.id}
                                onDiscard={() => void discardGame(game)}
                                onLetGo={() => void letGo(game)}
                            />
                        ))}
                    </ul>
                </section>
            )}
        </>
    );
};

export const PlayStart = ({ open = openStore }: { readonly open?: () => Promise<Store> }) => (
    <>
        <WithGames open={open}>
            {({ play, names }) => <InPlay play={play} names={names} />}
        </WithGames>
        <div className="dk-stack dk-stack-heading">
            <h2 className="dk-eyebrow" id="start">
                Start a new game
            </h2>
            <ul className="dk-rows dk-rows-tiles" role="list" aria-labelledby="start">
                {GAMES.map((game) => (
                    <li key={game.id}>
                        <Link
                            className="dk-row gtt-game"
                            data-game={game.id}
                            href={newGameOf(game.id)}
                        >
                            <span className="dk-row-text">
                                <span className="dk-row-title">{game.name}</span>
                                <span className="dk-visually-hidden">, </span>
                                <span className="dk-row-detail">
                                    {cardOf(game.id).line} {playersOf(game)}.
                                </span>
                            </span>
                            <span className="dk-row-sign" aria-hidden="true">
                                ›
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </div>
        <p className="dk-note">{NOT_AFFILIATED}</p>
    </>
);
