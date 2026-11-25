import type { ShowToast } from '@jasonsdevspace/design-kit/controls';
import { type RefObject, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { hearNewer } from '../store/store.js';
import { applyUpdate, page, subscribeUpdate, updateNeeded, updateState } from '../update.js';

export const OFFER = 'A new version of the app is ready.';
const CLOSED = 'The app was updated in another tab, so this page will reload.';
/** How long the words that say the page will reload stay before it does, in milliseconds. */
const RELOAD_AFTER = 4000;

/**
 * Offers a newer build in the frame's toast, with one action that applies it. A reload in the
 * middle of a round is the one thing the app must not do to a table, so the offer is never made on
 * the round's screen, and is taken away as the visitor arrives there. It is made on each arrival at
 * any other screen, kept as the visitor moves on while it shows, and made again on the next arrival
 * once it has gone untaken. It waits while any other message shows, so it never takes the place of
 * one that offers Undo, and is made once that one goes.
 *
 * Where a newer build has refused the page the database, the page can do nothing else, so the
 * offer is made on whatever screen is open. Where a newer build has closed the store under the
 * page, the page says so and reloads.
 */
export const useUpdateOffer = ({
    screen,
    search,
    show,
    toast,
    last,
}: {
    /** The open screen's route name. */
    readonly screen: string;
    /** The address's query, which with the screen places the visitor. */
    readonly search: string;
    readonly show: ShowToast;
    /** The toast, which carries data-shown while it shows a message. */
    readonly toast: HTMLElement | null;
    /** The message shown last through the frame's toast. */
    readonly last: RefObject<string | null>;
}): void => {
    const state = useSyncExternalStore(subscribeUpdate, updateState, () => 'none');
    // Counts each time a message leaves, so an offer that waited is made once the toast is free.
    const [freed, setFreed] = useState(0);
    // The offer made, and the place it was last shown at, where it was made since the visitor was
    // last on the round's screen.
    const made = useRef<{ place: string; readonly dismiss: () => void } | null>(null);
    const place = `${screen}${search}`;

    useEffect(
        () =>
            hearNewer((how) => {
                if (how === 'refused') {
                    updateNeeded();
                    return;
                }
                show(CLOSED);
                window.setTimeout(page.reload, RELOAD_AFTER);
            }),
        [show]
    );

    useEffect(() => {
        if (!toast) return undefined;
        const watch = new MutationObserver(() => {
            if (!('shown' in toast.dataset)) setFreed((count) => count + 1);
        });
        watch.observe(toast, { attributeFilter: ['data-shown'] });
        return () => {
            watch.disconnect();
        };
    }, [toast]);

    useEffect(() => {
        const busy = toast !== null && 'shown' in toast.dataset;
        const showing = busy && last.current === OFFER;
        if (state === 'none' || (state === 'ready' && screen === 'game')) {
            if (showing) made.current?.dismiss();
            made.current = null;
            return;
        }
        if (showing && made.current) made.current.place = place;
        if (busy || made.current?.place === place) return;
        made.current = { place, dismiss: show(OFFER, { label: 'Update', onAction: applyUpdate }) };
    }, [state, screen, place, freed, toast, show, last]);
};
