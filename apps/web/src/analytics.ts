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
 * kept on the phone until it is sent, and taken off the list as it is sent, so it is never sent
 * twice. One that fails with the connection lost at any point while it was on its way goes back on
 * the list and is sent once the connection returns, even when its failure arrives after it has. One
 * that fails with the browser online throughout, as a blocker makes it, is dropped, so the list
 * never holds what can never be sent. One page at a time sends, and every change to the list is
 * made under a lock, so two pages never write over each other.
 *
 * The list is kept in local storage, the smallest place that outlasts the page: a short list under
 * one key, read and written at once, with no database to open or upgrade and no worker to wake.
 * Where a write to it fails, the list is kept in memory until the page closes. It is the only thing
 * counting stores on the phone, and it is removed where a visit does not count.
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

/**
 * An event as it is kept: an id of its own, which never leaves the phone and only tells one kept
 * event from another, its name, and for a game the game's name.
 */
interface Kept {
    readonly i: string;
    readonly n: Counted;
    readonly g?: string;
}

/** The key in local storage under which events wait to be sent, and the name of the lock to send. */
export const KEPT = 'gametabletally-counts';

/**
 * The most events kept. Past it a new event is dropped, so those kept stay as they were made, and
 * a phone with no connection for a long time keeps a short list.
 */
export const MOST_KEPT = 50;

/** How long a send may go unanswered before it is given up, so sending never stops for good. */
const SEND_LIMIT_MS = 10_000;

/**
 * Whether an entry read back is an event the app makes: an install alone, or a game's event with
 * the name of a game the app knows, so a list changed on the phone sends nothing else.
 */
const isKept = (entry: unknown): entry is Kept => {
    if (typeof entry !== 'object' || entry === null || !('i' in entry) || !('n' in entry))
        return false;
    const game = 'g' in entry ? entry.g : undefined;
    if (typeof entry.i !== 'string') return false;
    if (entry.n === 'Install') return game === undefined;
    return (
        (entry.n === 'Game started' || entry.n === 'Game finished') &&
        GAMES.some(({ name }) => name === game)
    );
};

/** The events kept in memory, which stand in for the stored list once a write to it fails. */
let unstored: Kept[] = [];

/** Whether the last write to local storage went through, so the stored list is the whole list. */
let stored = true;

/** The events waiting to be sent, oldest first, no more than the most kept. */
const kept = (): Kept[] => {
    if (!stored) return unstored;
    try {
        const read: unknown = JSON.parse(localStorage.getItem(KEPT) ?? '[]');
        return Array.isArray(read) ? read.filter(isKept).slice(0, MOST_KEPT) : [];
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
        stored = true;
    } catch {
        // Kept in memory alone, until a write goes through or the page is closed.
        stored = false;
    }
};

/** Forgets every event kept, where a visit no longer counts. */
const forget = (): void => {
    unstored = [];
    try {
        localStorage.removeItem(KEPT);
    } catch {
        // Nothing was stored.
    }
};

/** Whether a send reached Plausible, or was let go by the tracker, rather than lost on the way. */
const done = (result: Parameters<NonNullable<PlausibleEventOptions['callback']>>[0]): boolean =>
    !(result && 'error' in result);

/**
 * What became of a send: it got through, or failed with the connection lost at some point while it
 * was on its way, so it is kept, or failed with the browser online throughout, so it is dropped.
 */
type Outcome = 'through' | 'offline' | 'online';

/** How many times the browser has said the connection went, so a send can tell it went meanwhile. */
let losses = 0;

/** Counts a lost connection. */
const lost = (): void => {
    losses += 1;
};

/**
 * Starts watching a send, and gives what became of it should it fail. A send made with no
 * connection, or one the connection was lost under, is kept even when its failure arrives after the
 * connection is back, so only a send refused with the browser online throughout, as a blocker
 * refuses it, is dropped.
 */
const watch = (): (() => Outcome) => {
    const offline = !navigator.onLine;
    const before = losses;
    return () => (offline || losses !== before || !navigator.onLine ? 'offline' : 'online');
};

/** The browser's locks, or nothing where it has none. */
const lockManager = (): LockManager | null =>
    typeof navigator.locks === 'object' ? navigator.locks : null;

/**
 * Makes a change to the list under a lock of its own, where the browser has one, so two pages that
 * change it at once never write over each other. The lock is held only for the change, never for a
 * send, so a page counting an event never waits on the network.
 */
const changing = <T>(change: () => T): Promise<T> => {
    const locks = lockManager();
    if (locks === null) return Promise.resolve(change());
    return locks.request(`${KEPT}-list`, change);
};

/** Sends an event, and resolves to what became of it, once counting has started. */
let send: ((event: Kept) => Promise<Outcome>) | null = null;

/** Whether this page is sending, so it runs one round of sending at a time. */
let sending = false;

/** Whether an event was counted during a round, so another round follows it. */
let again = false;

/**
 * Sends the events waiting, oldest first. Each is taken off the list by its id before it is sent,
 * so a page that closes with a send on its way, or another page sending at the same time, never
 * sends it again. One that fails with the connection lost while it was on its way is put back at
 * the head of the list, to send when the connection returns. One that fails with the browser online
 * throughout, as a blocker makes it, is dropped, so the list never holds events that can never be sent. One page at
 * a time sends, under a lock where the browser has one.
 */
const sendKept = (): void => {
    if (send === null || typeof window.fetch !== 'function') return;
    if (sending) {
        again = true;
        return;
    }
    const sendOne = send;
    sending = true;
    const round = async () => {
        for (;;) {
            const event = await changing(() => {
                const [first, ...rest] = kept();
                if (first !== undefined) keep(rest);
                return first;
            });
            if (event === undefined) return;
            if ((await sendOne(event)) !== 'offline') continue;
            await changing(() => {
                keep([event, ...kept()].slice(0, MOST_KEPT));
            });
            return;
        }
    };
    const locks = lockManager();
    void (
        locks === null
            ? round()
            : locks.request(KEPT, { ifAvailable: true }, (lock) => (lock ? round() : undefined))
    )
        .catch(() => undefined)
        .finally(() => {
            sending = false;
            if (!again) return;
            again = false;
            sendKept();
        });
};

/**
 * Counts an event where a visit counts, for a game by the id of the game in the app's list, and
 * sends it, or keeps it to send later. Where a visit does not count, any events kept are
 * forgotten.
 */
export const countEvent = (
    name: Counted,
    game?: string,
    where: Pick<Location, 'hostname'> = location,
    browser: object = navigator
): void => {
    if (!counts(where, browser)) {
        forget();
        return;
    }
    const named = GAMES.find(({ id }) => id === game)?.name;
    if (game !== undefined && named === undefined) return;
    const i = Math.random().toString(36).slice(2);
    void changing(() => {
        const events = kept();
        if (events.length >= MOST_KEPT) return;
        keep([...events, named === undefined ? { i, n: name } : { i, n: name, g: named }]);
    })
        .then(sendKept)
        .catch(() => undefined);
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
    if (!counts(where, browser)) {
        forget();
        return false;
    }
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
        send = ({ n, g }) =>
            new Promise<Outcome>((sent) => {
                const failed = watch();
                const late = setTimeout(() => {
                    sent(failed());
                }, SEND_LIMIT_MS);
                track(n, {
                    ...(g === undefined ? {} : { props: { game: g } }),
                    callback: (result) => {
                        clearTimeout(late);
                        sent(done(result) ? 'through' : failed());
                    },
                });
            });
        window.addEventListener('popstate', countMove);
        window.addEventListener('online', sendKept);
        window.addEventListener('offline', lost);
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
    again = false;
    last = null;
    unstored = [];
    stored = true;
    window.removeEventListener('popstate', countMove);
    window.removeEventListener('online', sendKept);
    window.removeEventListener('offline', lost);
    losses = 0;
};
