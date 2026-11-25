import { useStatus } from '@jasonsdevspace/design-kit/react';
import { useCallback, useMemo, useState } from 'react';

import type { Play } from '../play/play.js';
import { refusalOf } from '../store/store.js';
import { useToast } from './frame-places.js';
import { useSummaryState } from './opened-game.js';

/*
 * The summary after an entry or a save of a round, in the frame's toast with one Undo, which every
 * screen of the frame shares: the round's screen offers it, and any screen that changes the games
 * takes it away first, so its Undo never reaches past a change it does not describe.
 */

/**
 * What the screen's summary gives a round: a way to show one, to take it away, and whether its Undo
 * is under way. A summary is offered with the words its Undo says on the screen's status line once
 * it puts the change back, or null where the screen says so itself, as the round's header does.
 */
export interface Summary {
    readonly offer: (words: string, back: string | null) => void;
    readonly clear: () => void;
    readonly undoing: () => boolean;
}

const UNDO_REFUSED = 'This could not be put back, since the game changed in another tab.';
const UNDO_FAILED = 'This could not be put back.';

/**
 * The summary after an entry or a save, in the frame's toast with one Undo, which puts the round
 * back as it stood before the change the summary describes. Its state is the frame's, as the toast
 * and the model of the games are, so it stays as the visitor moves to another screen of the frame,
 * its Undo still works there, and the next entry takes it away wherever it begins. Taking it away
 * forgets its change, so no Undo outlives the words that offer it, and while an Undo is under way
 * the round takes no tap, so none lands in the player it puts back.
 */
export const useSummary = (play: Play): Summary => {
    const show = useToast();
    const say = useStatus();
    const state = useSummaryState();
    const clear = useCallback(() => {
        const dismiss = state.take();
        if (dismiss === null) return;
        dismiss();
        play.dismissUndo();
    }, [play, state]);
    const offer = useCallback(
        (words: string, back: string | null) => {
            state.hold(
                show(words, {
                    label: 'Undo',
                    onAction: () => {
                        state.hold(null);
                        state.setUndoing(true);
                        void play
                            .undo()
                            .then(
                                (done) => {
                                    if (!done) show(UNDO_REFUSED);
                                    else if (back !== null) say(back);
                                },
                                () => {
                                    show(UNDO_FAILED);
                                }
                            )
                            .finally(() => {
                                state.setUndoing(false);
                            });
                    },
                })
            );
        },
        [play, show, say, state]
    );
    return useMemo(() => ({ offer, clear, undoing: state.undoing }), [offer, clear, state]);
};

/**
 * The models with a discard running, so a second discard of any of their games is let go. Each
 * model is the frame's, shared by every screen in it, so the guard lasts as long as the model and
 * no longer.
 */
const discardsRunning = new WeakSet<Play>();

/**
 * Discards a game at once, or deletes a finished one, with the frame's toast offering Undo, as the
 * app does in place of asking first, and resolves to whether it did, or to the words that say why
 * not, beside the id of the game being taken away, or null. The game is named by its name, and by
 * the day it was played where that is given, and the same words say it is back once Undo puts it
 * back. A tap while an Undo or any discard of the model's is under way is ignored, so a discard of
 * another game never runs beside one, and the button that discards is the kit's busy button while
 * its discard runs, so a double tap discards once.
 */
export const useDiscard = (
    play: Play,
    /** What the words call it: a game in play is discarded, and a finished one deleted. */
    done: 'discarded' | 'deleted' = 'discarded'
): readonly [
    (id: string, gameName: string, day?: string) => Promise<true | string | null>,
    string | null,
] => {
    const summary = useSummary(play);
    const [discarding, setDiscarding] = useState<string | null>(null);
    const discard = useCallback(
        async (id: string, gameName: string, day?: string) => {
            if (discardsRunning.has(play) || summary.undoing()) return null;
            discardsRunning.add(play);
            setDiscarding(id);
            summary.clear();
            try {
                await play.discard(id);
            } catch (error: unknown) {
                return refusalOf(error) ?? `The game could not be ${done}. Try again.`;
            } finally {
                discardsRunning.delete(play);
                setDiscarding(null);
            }
            const game = `The game of ${gameName}${day === undefined ? '' : ` from ${day}`}`;
            summary.offer(`${game} is ${done}.`, `${game} is back.`);
            return true as const;
        },
        [play, summary, done]
    );
    return [discard, discarding] as const;
};
