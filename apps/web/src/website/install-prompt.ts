import { useSyncExternalStore } from 'react';

/**
 * The browser's own offer to install the app, where it makes one. Chrome and Edge on Android and
 * on a computer fire `beforeinstallprompt` once the app can be installed, and the page may keep
 * the event and show the offer when a visitor asks for it. Safari makes no such offer, so an
 * iPhone is told the steps instead.
 *
 * The event can fire before the page's screens are drawn, so it is heard from the moment this
 * module loads, and kept until it is used or the app is installed.
 */

/** The event the browser fires when it would install the app, which no DOM type names yet. */
export interface InstallPromptEvent extends Event {
    prompt(): Promise<void>;
    readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

/** Where the offer stands: none yet, one held to show, or the app installed. */
export type InstallState =
    | { readonly kind: 'none' }
    | { readonly kind: 'offered'; readonly event: InstallPromptEvent }
    | { readonly kind: 'installed' };

const NONE: InstallState = { kind: 'none' };
const INSTALLED: InstallState = { kind: 'installed' };

let state: InstallState = NONE;
const listeners = new Set<() => void>();

const set = (next: InstallState) => {
    state = next;
    for (const listener of listeners) listener();
};

/** Whether the page is open as the installed app rather than in a browser tab. */
const standalone = (): boolean =>
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;

/** Whether an event is the browser's offer, which can be shown. */
const isOffer = (event: Event): event is InstallPromptEvent =>
    'prompt' in event && typeof event.prompt === 'function' && 'userChoice' in event;

/** Stops hearing the browser, for the listening that is under way. */
let stopListening = (): void => undefined;

/**
 * Starts hearing the browser's offer and the app's installation, in place of any listening under
 * way. Called once when the module loads in a browser, and again by a test that starts afresh.
 */
export const listenForInstall = (): (() => void) => {
    stopListening();
    state = standalone() ? INSTALLED : NONE;
    const offer = (event: Event) => {
        // Held, so the browser shows no offer of its own until the visitor asks on the page.
        event.preventDefault();
        if (state.kind !== 'installed' && isOffer(event)) set({ kind: 'offered', event });
    };
    const installed = () => {
        set(INSTALLED);
    };
    window.addEventListener('beforeinstallprompt', offer);
    window.addEventListener('appinstalled', installed);
    stopListening = () => {
        window.removeEventListener('beforeinstallprompt', offer);
        window.removeEventListener('appinstalled', installed);
    };
    return stopListening;
};

if (typeof window !== 'undefined') listenForInstall();

/**
 * Shows the browser's offer. The event can be shown once, so it is let go once the visitor
 * answers, or once the browser refuses to show it, and the browser fires a new one later if the
 * app can still be installed. The offer is held while the browser asks, so the button that asked
 * stays on the page until there is an answer.
 */
export const install = async (): Promise<void> => {
    if (state.kind !== 'offered') return;
    const { event } = state;
    try {
        await event.prompt();
        const { outcome } = await event.userChoice;
        set(outcome === 'accepted' ? INSTALLED : NONE);
    } catch {
        // A browser that will not show the offer again leaves the steps on the page to follow.
        set(NONE);
    }
};

const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

/**
 * Where the offer stands. The prerender and the page's first draw hold no offer, so the page the
 * build wrote and the one the browser draws first are the same, and an offer already held shows
 * once the page has taken over.
 */
export const useInstall = (): InstallState =>
    useSyncExternalStore(
        subscribe,
        () => state,
        () => NONE
    );
