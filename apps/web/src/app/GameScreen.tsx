import { Button, useBusy, useStatus } from '@jasonsdevspace/design-kit/react';
import { type ReactNode, use, useEffect, useState } from 'react';

import { Link, navigate, usePlace } from '../navigation.js';
import type { Play } from '../play/play.js';
import { changedFrom, changingRoundOf, hrefOf, roundIn } from '../routes.js';
import type { SavedStep } from '../store/format.js';
import { useKeepAwake } from './awake.js';
import { ENTRIES, fetchGameAhead } from './entries.js';
import { Dock } from './frame-places.js';
import { gameNameOf } from './in-play.js';
import { GameGone, type OpenedGameProps, useGame, WithOpenedGame } from './opened-game.js';
import { type GameWithDraft, isChanging } from './round.js';
import { type Summary, useDiscard, useSummary } from './summary.js';

/*
 * The game in play: the score header on top, and below it, in reach of a thumb, the keys a round
 * is entered with, player by player in seat order. Flip 7 is entered by tapping the cards a player
 * ends the round holding. Each tap is kept at once, so a page loaded again in the middle of a hand
 * comes back to it, and the header's total, which the rules work out from what was kept, shows the
 * round as it stands. The button for the next player names them, and after the last it saves the
 * round. After each entry and each save the frame's toast says what each player scored, with any
 * rule that changed a score in words, and offers one Undo, until the next entry begins. A player
 * can be skipped for the round from under the header, the whole hand away from that button, and
 * put back until the round is saved. Nothing here adds anything up. Each game's entry is a file of
 * its own, loaded for a game of that kind alone.
 */

/**
 * The ways out of a game in play, at the top of its screen, out of the way of the keys: leaving it
 * as it is, which the start screen offers to continue, and discarding it, at once, with the
 * frame's toast offering Undo, as the app does in place of asking first.
 */
const GameActions = ({
    play,
    id,
    gameName,
}: {
    readonly play: Play;
    readonly id: string;
    readonly gameName: string;
}) => {
    const say = useStatus();
    const [discardGame, discarding] = useDiscard(play);
    const discardButton = useBusy<HTMLButtonElement>();
    const discard = async () => {
        const done = await discardGame(id, gameName);
        if (done === true) navigate(hrefOf('play'));
        else if (done !== null) say(done);
    };
    return (
        <>
            <p className="dk-actions gtt-game-actions">
                <Link className="dk-button dk-button-text" href={hrefOf('play')}>
                    Leave for now
                </Link>
                <Button
                    ref={discardButton}
                    text
                    busy={discarding === null ? false : 'Discarding the game.'}
                    onClick={() => void discard()}
                >
                    Discard the game
                </Button>
            </p>
        </>
    );
};

/** The round being entered of one game, drawn from the model as it stands. */
const Entry = ({
    play,
    id,
    names,
}: {
    readonly play: Play;
    readonly id: string;
    readonly names: ReadonlyMap<string, string>;
}) => {
    const summary = useSummary(play);
    const game = useGame(play, id);
    const kind = game?.saved.game;
    // The game's round entry and its scores are fetched as the game opens.
    useEffect(() => {
        if (kind !== undefined) fetchGameAhead(kind);
    }, [kind]);
    // The screen stays lit while the game is in play, and not once it is over.
    useKeepAwake(game !== undefined && game.draft !== null);
    // The address names a round being changed, so the bar and the page's title do. One arrived at
    // another way, such as Back to the game, is put right in place, as is one that names a round
    // no longer opened.
    const { search } = usePlace();
    const named = roundIn(search);
    const from = changedFrom(search);
    const opened = game?.draft && isChanging(game, game.draft) ? game.draft.index + 1 : null;
    useEffect(() => {
        if (game === undefined || named === opened) return;
        navigate(opened === null ? hrefOf('game', id) : changingRoundOf(id, opened - 1, from), {
            replace: true,
        });
    }, [game, named, opened, id, from]);
    if (!game) return <GameGone />;
    const gameName = gameNameOf(game.saved.game);
    const { draft } = game;
    // A finished game's screen says so, and its recap is in the dock.
    if (draft === null)
        return (
            <>
                <p>This game of {gameName} is over.</p>
                <Dock>
                    <Link
                        className="dk-button dk-button-accent dk-button-tall"
                        href={hrefOf('recap', id)}
                    >
                        See the recap
                    </Link>
                </Dock>
            </>
        );
    return (
        <RoundFor
            play={play}
            game={{ ...game, draft }}
            names={names}
            summary={summary}
            actions={<GameActions play={play} id={id} gameName={gameName} />}
        />
    );
};

/**
 * Whether the round has just come back to a player's entry from who ended it, read from the part
 * of the round each draw is at, so the player come back to can be told so.
 */
const useCameBack = (part: string | null): boolean => {
    const [was, setWas] = useState(part);
    const [back, setBack] = useState(false);
    if (was !== part) {
        setBack(was === 'ender');
        setWas(part);
    }
    return back;
};

/**
 * Which screen draws the step a round is at: a round of Wizard, entered a moment at a time for
 * every player on one screen, who ended a round of Skyjo, which is a step of the round's own, a
 * player's entry in Skyjo or Flip 7, or none, for a round whose every entry is in or a game this
 * phone has no screen for.
 */
const screenOf = (
    game: string,
    step: SavedStep | null
): 'wizard' | 'ender' | 'skyjo' | 'flip-7' | null => {
    if (step === null) return null;
    if (game === 'wizard') return 'wizard';
    if (game === 'skyjo') return step.part === 'ender' ? 'ender' : 'skyjo';
    return game === 'flip-7' ? 'flip-7' : null;
};

/**
 * The step a round is at, drawn by its game's own screen: a player's entry, or who ended a round of
 * Skyjo, which is a step of the round's own, or a word that the game cannot be entered here.
 */
const RoundFor = ({
    play,
    game,
    names,
    summary,
    actions,
}: {
    readonly play: Play;
    readonly game: GameWithDraft;
    readonly names: ReadonlyMap<string, string>;
    readonly summary: Summary;
    readonly actions: ReactNode;
}) => {
    const { draft } = game;
    const step = draft.step;
    const parts = { play, game, names, summary, actions };
    const arrived = useCameBack(step?.part ?? null);
    const player = step?.player ?? null;
    const kind = game.saved.game;
    const screen = screenOf(kind, step);
    // Each game's entry is read from its own file, which the screen's boundary waits for.
    if (screen === 'wizard') {
        const { WizardRound } = use(ENTRIES.wizard.load());
        return <WizardRound {...parts} />;
    }
    if (screen === 'ender' || screen === 'skyjo') {
        const { SkyjoEnder, SkyjoRound } = use(ENTRIES.skyjo.load());
        if (screen === 'ender') return <SkyjoEnder {...parts} />;
        if (player !== null) return <SkyjoRound {...parts} player={player} arrived={arrived} />;
    }
    if (screen === 'flip-7' && player !== null) {
        const { Flip7Round } = use(ENTRIES['flip-7'].load());
        return <Flip7Round {...parts} player={player} />;
    }
    return (
        <div className="gtt-game">
            <div className="dk-stack dk-stack-heading">
                {isChanging(game, draft) ? null : actions}
            </div>
            <p>
                {player === null
                    ? 'Every score of the round is in.'
                    : `A game of ${gameNameOf(kind)} cannot be entered on this phone, though its scores can be read.`}
            </p>
            <Dock>
                <Link
                    className="dk-button dk-button-accent dk-button-tall"
                    href={hrefOf('scores', game.saved.id)}
                >
                    Scores
                </Link>
            </Dock>
        </div>
    );
};

export type GameScreenProps = OpenedGameProps;

/**
 * The game in play named by the address, read once the screen is running, so the prerendered page
 * holds only the frame. The database stays open while the screen is shown, since every tap saves.
 */
export const GameScreen = (props: GameScreenProps) => (
    <WithOpenedGame {...props}>
        {({ id, play, names }) => <Entry play={play} id={id} names={names} />}
    </WithOpenedGame>
);
