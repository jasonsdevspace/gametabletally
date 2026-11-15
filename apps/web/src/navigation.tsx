import { type ComponentProps, type MouseEvent, useSyncExternalStore } from 'react';

/**
 * Moving between screens inside the app, with no router dependency.
 *
 * The addresses are a short list of exact paths, so the screen is chosen from the path alone. A
 * move inside the app writes the new address into the browser's history and redraws, with no
 * reload, so whatever is held in memory, such as a toast that offers Undo, survives the move.
 * The browser's Back and Forward redraw the same way.
 */

/** Where the app is: the path, and the query, which carries the id of what a screen is about. */
export interface Place {
    readonly path: string;
    readonly search: string;
}

const listeners = new Set<() => void>();

/** The path the prerender is drawing, which stands in for the browser's address on the server. */
let drawing: Place = { path: '/', search: '' };

/** Sets the place the prerender draws. The browser never calls it. */
export const drawAt = (place: Place): void => {
    drawing = place;
};

let current: Place | null = null;

const read = (): Place => {
    const { pathname, search } = window.location;
    if (current?.path !== pathname || current.search !== search)
        current = { path: pathname, search };
    return current;
};

const notify = () => {
    for (const listener of listeners) listener();
};

const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener);
    if (listeners.size === 1) window.addEventListener('popstate', notify);
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0) window.removeEventListener('popstate', notify);
    };
};

/**
 * Where the app is. In the browser it is the address, and in the prerender the place being
 * drawn, so the page the prerender wrote and the page the browser draws first are the same.
 */
export const usePlace = (): Place =>
    useSyncExternalStore(subscribe, read, () => (typeof window === 'undefined' ? drawing : read()));

/**
 * Moves to an address inside the app with no reload, at the top of the new screen, and leaves an
 * entry Back returns to, or, with `replace`, puts the new address in the current one's place, as
 * after a form whose work is done and should not be done twice. Back and Forward leave the browser
 * to put the scroll back where it was.
 */
export const navigate = (href: string, { replace = false } = {}): void => {
    if (replace) window.history.replaceState(null, '', href);
    else window.history.pushState(null, '', href);
    window.scrollTo(0, 0);
    notify();
};

/** Whether a click is one the app takes over: the main button, with no key that asks for a new tab. */
const isPlainClick = (event: MouseEvent<HTMLAnchorElement>): boolean =>
    event.button === 0 &&
    !event.defaultPrevented &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey;

/**
 * A link to an address of the app. A plain click moves with no reload, and anything else, a new
 * tab or a page with no script, follows the link as any link is followed.
 */
export const Link = ({
    href,
    onClick,
    ...rest
}: ComponentProps<'a'> & { readonly href: string }) => (
    <a
        {...rest}
        href={href}
        onClick={(event) => {
            onClick?.(event);
            if (!isPlainClick(event)) return;
            event.preventDefault();
            navigate(href);
        }}
    />
);
