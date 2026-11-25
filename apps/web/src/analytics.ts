import { GAMES } from '@gametabletally/scoring';
import type * as Tracker from '@plausible-analytics/tracker';
import type { PlausibleEventOptions, PlausibleRequestPayload } from '@plausible-analytics/tracker';

import { NOT_FOUND_FILE, routeAt } from './routes.js';

/**
 * Counts page views with Plausible, on the live address only, so the dev server, the browser
 * tests and the Lighthouse audits are never counted. No cookie is set, and a visitor whose browser
 * sends Global Privacy Control is not counted at all.
 *
 * A page is sent by its address alone, with no query and no fragment, so the id of a game or a
 * player never leaves the phone, and a path that is no address of the app is sent as the
 * not-found page, so nothing typed into one is sent either. The page before it is sent the same
 * way. The first page is counted once the page has loaded, and every move after it is counted by
 * the app's own move between screens and by Back and Forward, so a move that replaces the address
 * counts as one that adds to it. The tracker is loaded only once a visit is to be counted, and a
 * tracker that cannot load or start, or a request a blocker stops, leaves the app as it was.
 *
 * Beside page views, three events are counted and no others: a game started and a game finished,
 * each with the game's name from the app's own list and nothing else, and an install. An event is
 * kept on the phone until it reaches Plausible, so one made with no connection is sent once the
 * connection returns. It is kept in local storage, the smallest place that outlasts the page: a
 * short list under one key, read and written at once, with no database to open or upgrade and no
 * worker to wake. That list is the only thing counting stores on the phone.
 */

/** The site in Plausible, and the only address whose visits are counted. */
export const DOMAIN = 'gametabletally.com';

/** An address as a URL, or nothing when it is no address at all. */
const parsed = (address: string): URL | undefined => {
    try {
        return new URL(address);
    } catch {
        return undefined;
    }
};

/**
 * An address as it is sent, or nothing when it is no address. One of the app's is cut to the
 * address of its screen, with a page's own file read as its address and any other path as the
 * not-found page. Another web address keeps its origin and path, and another kind, such as the
 * referrer an app on a phone gives, is cut at its query.
 */
const sentAs = (address: string): string | null => {
    const url = parsed(address);
    if (!url) return null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
        return address.replace(/[?#].*$/s, '');
    if (url.hostname !== DOMAIN) return `${url.origin}${url.pathname}`;
    return `${url.origin}${routeAt(url.pathname)?.path ?? `/${NOT_FOUND_FILE}`}`;
};

/**
 * What is sent for a page view, with the page and the page before it each cut as `sentAs` cuts
 * them, or nothing when the page's address cannot be read. It never throws, since the tracker
 * calls it from its own listeners.
 */
export const pathsOnly = (payload: PlausibleRequestPayload): PlausibleRequestPayload | null => {
    const page = sentAs(payload.u);
    if (page === null) return null;
    return { ...payload, u: page, r: payload.r ? sentAs(payload.r) : null };
};

/** Whether a visit is counted: on the live address, from a browser that allows it. */
export const counts = (where: Pick<Location, 'hostname'>, browser: object): boolean =>
    where.hostname === DOMAIN &&
    !('globalPrivacyControl' in browser && browser.globalPrivacyControl === true);

/** The events counted beside page views. */
export type Counted = 'Game started' | 'Game finished' | 'Install';

/** An event as it is kept: its name, and for a game the game's name. */
type Kept = readonly [Counted] | readonly [Counted, string];

/** The key in local storage under which events wait to be sent. */
export const KEPT = 'gametabletally-counts';

/**
 * The most events kept. Past it a new event is dropped, so those kept stay as they were made, and
 * a phone with no connection for a long time keeps a short list.
 */
export const MOST_KEPT = 50;

/**
 * Whether an entry read back is an event the app makes: an install alone, or a game's event with
 * the name of a game the app knows, so a list changed on the phone sends nothing else.
 */
const isKept = (entry: unknown): entry is Kept =>
    Array.isArray(entry) &&
    (entry.length === 1
        ? entry[0] === 'Install'
        : entry.length === 2 &&
          (entry[0] === 'Game started' || entry[0] === 'Game finished') &&
          GAMES.some(({ name }) => name === entry[1]));

/** The events kept in memory, for a browser that will not store them. */
let unstored: Kept[] = [];

/** The events waiting to be sent, oldest first. */
const kept = (): Kept[] => {
    try {
        const read: unknown = JSON.parse(localStorage.getItem(KEPT) ?? '[]');
        return Array.isArray(read) ? read.filter(isKept) : [];
    } catch {
        return unstored;
    }
};

/** Keeps the events waiting to be sent, removing the key once none are. */
const keep = (events: Kept[]): void => {
    unstored = events;
    try {
        if (events.length > 0) localStorage.setItem(KEPT, JSON.stringify(events));
        else localStorage.removeItem(KEPT);
    } catch {
        // Kept in memory alone, until the page is closed.
    }
};

/** Whether a send reached Plausible, or was let go by the tracker, rather than lost on the way. */
const done = (result: Parameters<NonNullable<PlausibleEventOptions['callback']>>[0]): boolean =>
    !(result && 'error' in result);

/** Sends an event, and says whether it got through, once counting has started. */
let send: ((event: Kept, sent: (through: boolean) => void) => void) | null = null;

/** Whether an event is on its way, so each is sent once, one at a time. */
let sending = false;

/** Sends the events waiting, oldest first, each taken off the list once it gets through. */
const sendKept = (): void => {
    const [first] = kept();
    if (send === null || sending || first === undefined) return;
    sending = true;
    send(first, (through) => {
        sending = false;
        if (!through) return;
        keep(kept().slice(1));
        sendKept();
    });
};

/**
 * Counts an event where a visit counts, for a game by the id of the game in the app's list, and
 * sends it, or keeps it to send later.
 */
export const countEvent = (
    name: Counted,
    game?: string,
    where: Pick<Location, 'hostname'> = location,
    browser: object = navigator
): void => {
    if (!counts(where, browser)) return;
    const named = GAMES.find(({ id }) => id === game)?.name;
    if (game !== undefined && named === undefined) return;
    const events = kept();
    if (events.length >= MOST_KEPT) return;
    keep([...events, named === undefined ? [name] : [name, named]]);
    sendKept();
};

/** Sends a page view for the address as it is, once counting has started. */
let count: (() => void) | null = null;

/** The address last counted, so a move that changes only the query is not counted again. */
let last: string | null = null;

/** Counts the page the app has just moved to, where counting has started. */
export const countMove = (): void => {
    if (count === null) return;
    const page = sentAs(location.href);
    if (page === last) return;
    last = page;
    count();
};

/** Starts counting where a visit counts, counting the page it is on, and says whether it did. */
export const countVisits = async (
    where: Pick<Location, 'hostname'> = location,
    browser: object = navigator,
    load: () => Promise<Pick<typeof Tracker, 'init' | 'track'>> = () =>
        import('@plausible-analytics/tracker')
): Promise<boolean> => {
    if (!counts(where, browser)) return false;
    try {
        const { init, track } = await load();
        init({
            domain: DOMAIN,
            transformRequest: pathsOnly,
            // The app counts its own moves, those that replace the address among them, which the
            // tracker's own count of pushed addresses would miss.
            autoCapturePageviews: false,
            // The tracker would otherwise set window.plausible and warn in the console.
            bindToWindow: false,
            logging: false,
        });
        // A page view that gets through says the connection is back, where the browser never
        // said it was gone.
        count = () => {
            track('pageview', {
                callback: (result) => {
                    if (done(result)) sendKept();
                },
            });
        };
        send = ([name, game], sent) => {
            track(name, {
                ...(game === undefined ? {} : { props: { game } }),
                callback: (result) => {
                    sent(done(result));
                },
            });
        };
        window.addEventListener('popstate', countMove);
        window.addEventListener('online', sendKept);
        countMove();
        sendKept();
        return true;
    } catch {
        // A tracker a blocker stopped, or a browser without what it needs, counts nothing.
        return false;
    }
};

/** Forgets that counting started, for the tests. */
export const stopCounting = (): void => {
    count = null;
    send = null;
    sending = false;
    last = null;
    unstored = [];
    window.removeEventListener('popstate', countMove);
    window.removeEventListener('online', sendKept);
};
