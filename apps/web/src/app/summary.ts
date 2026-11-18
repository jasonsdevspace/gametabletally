import { useCallback, useMemo } from 'react';

import type { Play } from '../play/play.js';
import { useToast } from './AppFrame.js';
import { useSummaryState } from './opened-game.js';

/*
 * The summary after an entry or a save of a round, in the frame's toast with one Undo, which every
 * screen of the frame shares: the round's screen offers it, and any screen that changes the games
 * takes it away first, so its Undo never reaches past a change it does not describe.
 */

/** What the screen's summary gives a round: a way to show one, to take it away, and whether its Undo is under way. */
export interface Summary {
    readonly offer: (words: string) => void;
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
    const state = useSummaryState();
    const clear = useCallback(() => {
        const dismiss = state.take();
        if (dismiss === null) return;
        dismiss();
        play.dismissUndo();
    }, [play, state]);
    const offer = useCallback(
        (words: string) => {
            state.hold(
                show(words, {
                    label: 'Undo',
                    onAction: () => {
                        state.hold(null);
                        state.setUndoing(true);
                        void play
                            .undo()
                            .then(
                                (back) => {
                                    if (!back) show(UNDO_REFUSED);
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
        [play, show, state]
    );
    return useMemo(() => ({ offer, clear, undoing: state.undoing }), [offer, clear, state]);
};
