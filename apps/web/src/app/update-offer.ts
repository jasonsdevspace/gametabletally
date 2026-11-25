import type { ShowToast, ToastAction } from '@jasonsdevspace/design-kit/controls';
import { useStatus } from '@jasonsdevspace/design-kit/react';
import { type RefObject, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { applyUpdate, page, subscribeUpdate, type UpdateState, updateState } from '../update.js';

const OFFER = 'A new version of the app is ready.';
const RELOAD_ONLY = 'The games on this phone need a newer version of the app.';
const REPLACED = 'The app was updated in another tab. Reload this page to keep scoring.';
const MISSING = 'This screen could not load. Reload this page to keep scoring.';

/** What the toast offers for a state, and where. */
interface Offer {
    readonly words: string;
    /** Whether it is Update, which hands the page to the waiting worker, or Reload. */
    readonly update: boolean;
    /** Whether it is made on the round's screen too. */
    readonly anywhere: boolean;
    /** Whether it takes the place of any message showing, rather than waiting for it to go. */
    readonly first: boolean;
}

const OFFERS: Readonly<Record<UpdateState, Offer | null>> = {
    // Nothing on the page can save once its database is closed, so it says so at once.
    closed: { words: REPLACED, update: false, anywhere: true, first: true },
    replaced: { words: REPLACED, update: false, anywhere: false, first: false },
    // A screen that could not load has nothing else to show, so it says so at once, anywhere.
    missing: { words: MISSING, update: false, anywhere: true, first: true },
    reload: { words: RELOAD_ONLY, update: false, anywhere: true, first: false },
    needed: { words: OFFER, update: true, anywhere: true, first: false },
    ready: { words: OFFER, update: true, anywhere: false, first: false },
    none: null,
};

/** An offer the visitor closed, and the place they closed it at. */
interface Hold {
    readonly words: string;
    readonly place: string;
}

/** The hold that lasts past the moves given, or none. */
const holdAfter = (
    hold: Hold | null,
    moves: { readonly left: boolean; readonly again: boolean; readonly place: string }
): Hold | null => (hold && heldUntil(hold, moves) ? hold : null);

/**
 * Whether a closed offer is made again: a notice on the next arrival, and the offer once the page
 * is shown again or a round's screen is left.
 */
const heldUntil = (
    hold: Hold,
    moves: { readonly left: boolean; readonly again: boolean; readonly place: string }
): boolean =>
    !moves.left && !moves.again && (hold.words !== REPLACED || hold.place === moves.place);

/** What to do with the offer: take it away, leave the toast as it is, or make it. */
const stepOf = (
    offer: Offer | null,
    at: {
        readonly screen: string;
        readonly busy: boolean;
        /** The offer the toast shows, where it shows one. */
        readonly showing: { readonly words: string } | null;
        readonly held: Hold | null;
    }
): 'take away' | 'leave' | 'make' => {
    if (!offer || (!offer.anywhere && at.screen === 'game')) return 'take away';
    if (at.showing?.words === offer.words || at.held?.words === offer.words) return 'leave';
    // Another message showing is waited for, unless the offer must say what it says at once.
    return at.busy && at.showing === null && !offer.first ? 'leave' : 'make';
};

/** The offer's one action: Update, which hands the page to the waiting worker, or Reload. */
const actionOf = (offer: Offer, say: (words: string) => void): ToastAction =>
    offer.update
        ? {
              label: 'Update',
              onAction: () => {
                  say('Updating the app.');
                  applyUpdate();
              },
          }
        : { label: 'Reload', onAction: page.reload };

/**
 * Offers a newer build in the frame's toast, with one action. A reload in the middle of a round is
 * the one thing the app must not do to a table, so the offer is never made on the round's screen,
 * and is taken away as the visitor arrives there. It waits while any other message shows, so it
 * never takes the place of one that offers Undo, and a message that takes its place gives it back
 * as it goes. Kept as the visitor moves on while it shows, it is held once they close it, until
 * the page is shown again or they leave a round's screen.
 *
 * Where a newer build has refused the page the database, the page can do nothing else, so the
 * offer is made on whatever screen is open, as a reload where no newer worker is waiting. A page
 * whose build another tab replaced says so with a Reload, where the offer would be made, or at once
 * on any screen where its database was closed. Closed, that is said again on the next arrival, and
 * the page reloads once it is next hidden, with no one reading it. A page whose screen's file did
 * not load with the browser online says so at once with a Reload, on any screen, until a screen
 * loads after all.
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
    const say = useStatus();
    const state = useSyncExternalStore(subscribeUpdate, updateState, (): UpdateState => 'none');
    const place = `${screen}${search}`;
    // Counts each time a message leaves, and each time the page is shown again, so an offer that
    // waited is made once it may be.
    const [freed, setFreed] = useState(0);
    // The words the toast was given for the offer, while it is the offer's to show.
    const made = useRef<{ readonly words: string; readonly dismiss: () => void } | null>(null);
    // An offer the visitor closed, and where, until it is made again.
    const held = useRef<Hold | null>(null);
    const at = useRef({ place, screen });
    // Whether the page has been shown again since the offer was last weighed.
    const again = useRef(false);
    const replaced = state === 'closed' || state === 'replaced';

    useEffect(() => {
        const shown = () => {
            if (document.visibilityState === 'visible') {
                again.current = true;
                setFreed((count) => count + 1);
            } else if (replaced) {
                document.removeEventListener('visibilitychange', shown);
                page.reload();
            }
        };
        document.addEventListener('visibilitychange', shown);
        return () => {
            document.removeEventListener('visibilitychange', shown);
        };
    }, [replaced]);

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
        const was = at.current;
        at.current = { place, screen };
        const busy = toast !== null && 'shown' in toast.dataset;
        // The offer while the toast still shows it, as the last message it was given.
        const ours = made.current?.words === last.current ? made.current : null;
        // The visitor closed the offer, or took it, where it is the last message and has gone.
        const closed = ours && !busy ? { words: ours.words, place: was.place } : null;
        if (closed) made.current = null;
        held.current = holdAfter(closed ?? held.current, {
            left: was.screen === 'game' && screen !== 'game',
            again: again.current,
            place,
        });
        again.current = false;
        const offer = OFFERS[state];
        const showing = busy ? ours : null;
        const step = stepOf(offer, { screen, busy, showing, held: held.current });
        if (step === 'take away') {
            made.current = null;
            showing?.dismiss();
        }
        if (step === 'make' && offer)
            made.current = { words: offer.words, dismiss: show(offer.words, actionOf(offer, say)) };
    }, [state, screen, place, freed, toast, show, last, say]);
};
