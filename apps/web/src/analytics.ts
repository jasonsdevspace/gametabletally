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
 * twice. One that fails while the browser says it is offline, or after the connection went or came
 * back while it was on its way, goes back on the list and is sent once the connection returns. One
 * that fails with the browser online throughout, as a blocker makes it, is dropped, so the list
 * never holds what can never be sent.
 *
 * The list is kept in a small database of its own on the phone, apart from the games, where every
 * change is one transaction, so two open pages counting at once never undo each other's events.
 * Events an older version left in local storage are moved into it once. Where the browser cannot
 * open the database, the list is kept in memory until the page closes. It is the only thing
 * counting stores on the phone, and it is deleted where a visit does not count.
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
interface Kept {
    readonly n: Counted;
    readonly g?: string;
}

/** The database the events wait in, on the phone, apart from the games. */
export const DATABASE = 'gametabletally-counts';

/** The store in it, each event under a key that keeps them in the order they were made. */
const STORE = 'kept';

/** The key in local storage an older version kept its waiting events under. */
export const OLDER_KEPT = 'gametabletally-counts';

/**
 * The most events kept. Past it a new event is dropped, so those kept stay as they were made, and
 * a phone with no connection for a long time keeps a short list.
 */
export const MOST_KEPT = 50;

/** How long a send may go unanswered before it is given up, so sending never stops for good. */
const SEND_LIMIT_MS = 10_000;

/**
 * Whether an entry read back is an event the app makes: an install alone, or a game's event with
 * the name of a game the app knows, so an entry changed on the phone sends nothing else.
 */
const isKept = (entry: unknown): entry is Kept => {
    if (typeof entry !== 'object' || entry === null || !('n' in entry)) return false;
    const game = 'g' in entry ? entry.g : undefined;
    if (entry.n === 'Install') return game === undefined;
    return (
        (entry.n === 'Game started' || entry.n === 'Game finished') &&
        GAMES.some(({ name }) => name === game)
    );
};

/** An event taken from the list to send, with the key it goes back under should it fail. */
interface Taken {
    readonly key: IDBValidKey;
    readonly event: Kept;
}

/** The list of events waiting to be sent, each change made at once across every open page. */
interface List {
    /** Adds an event, unless the list holds the most it keeps. */
    readonly add: (event: Kept) => Promise<void>;
    /** Takes the oldest event off the list, or nothing where none waits. */
    readonly take: () => Promise<Taken | null>;
    /** Puts an event back at the head of the list. */
    readonly putBack: (taken: Taken) => Promise<void>;
}

/** A transaction's work, resolved once the transaction has completed. */
const inStore = <T>(
    database: IDBDatabase,
    work: (store: IDBObjectStore, done: (value: T) => void) => void
): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const transaction = database.transaction(STORE, 'readwrite');
        let value: T;
        work(transaction.objectStore(STORE), (result) => {
            value = result;
        });
        transaction.oncomplete = () => {
            resolve(value);
        };
        transaction.onerror = () => {
            reject(transaction.error ?? new Error('The counts were not changed.'));
        };
        transaction.onabort = () => {
            reject(transaction.error ?? new Error('The counts were not changed.'));
        };
    });

/** The list kept in the database, each change one transaction, so two pages never undo another's. */
const storedList = (database: IDBDatabase): List => ({
    add: (event) =>
        inStore<undefined>(database, (store, done) => {
            const counted = store.count();
            counted.onsuccess = () => {
                if (counted.result < MOST_KEPT) store.add(event);
                done(undefined);
            };
        }),
    take: () =>
        inStore<Taken | null>(database, (store, done) => {
            done(null);
            const cursor = store.openCursor();
            cursor.onsuccess = () => {
                const at = cursor.result;
                if (!at) return;
                const event: unknown = at.value;
                at.delete();
                // An entry changed on the phone is let go, and the next one taken in its place.
                if (isKept(event)) done({ key: at.primaryKey, event });
                else at.continue();
            };
        }),
    putBack: ({ key, event }) =>
        inStore<undefined>(database, (store, done) => {
            store.put(event, key);
            done(undefined);
        }),
});

/** The list kept in memory, for a browser that cannot open the database, until the page closes. */
const memoryList = (): List => {
    let next = 0;
    const events: Taken[] = [];
    return {
        add: (event) => {
            if (events.length < MOST_KEPT) events.push({ key: (next += 1), event });
            return Promise.resolve();
        },
        take: () => Promise.resolve(events.shift() ?? null),
        putBack: (taken) => {
            events.unshift(taken);
            return Promise.resolve();
        },
    };
};

/** The events an older version left in local storage, which are moved to the database once. */
const olderEvents = (): Kept[] => {
    try {
        const read: unknown = JSON.parse(localStorage.getItem(OLDER_KEPT) ?? '[]');
        localStorage.removeItem(OLDER_KEPT);
        return Array.isArray(read)
            ? read.filter(isKept).map(({ n, g }) => (g === undefined ? { n } : { n, g }))
            : [];
    } catch {
        return [];
    }
};

/** Opens the database, making its store the first time. */
const openDatabase = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        const opening = indexedDB.open(DATABASE, 1);
        opening.onupgradeneeded = () => {
            opening.result.createObjectStore(STORE, { autoIncrement: true });
        };
        opening.onsuccess = () => {
            resolve(opening.result);
        };
        opening.onerror = () => {
            reject(opening.error ?? new Error('The counts could not be opened.'));
        };
    });

/** The list, once opened, which every change waits for. */
let list: Promise<List> | null = null;

/** The connection the list holds, closed where a visit no longer counts. */
let connection: IDBDatabase | null = null;

/**
 * The list of events waiting, in the database where the browser opens it and in memory where it
 * cannot, with any events an older version left in local storage moved into it.
 */
const theList = (): Promise<List> => {
    list ??= openDatabase().then(
        async (database) => {
            connection = database;
            // A newer version of the database closes this one, and the next change opens it again.
            database.onversionchange = () => {
                database.close();
                connection = null;
                list = null;
            };
            const opened = storedList(database);
            for (const event of olderEvents()) await opened.add(event);
            return opened;
        },
        () => memoryList()
    );
    return list;
};

/** Forgets every event kept, where a visit no longer counts, leaving nothing on the phone. */
const forget = (): void => {
    connection?.close();
    connection = null;
    list = null;
    try {
        localStorage.removeItem(OLDER_KEPT);
    } catch {
        // Nothing was stored.
    }
    try {
        indexedDB.deleteDatabase(DATABASE);
    } catch {
        // The browser keeps no database.
    }
};

/** Whether a send reached Plausible, or was let go by the tracker, rather than lost on the way. */
const done = (result: Parameters<NonNullable<PlausibleEventOptions['callback']>>[0]): boolean =>
    !(result && 'error' in result);

/**
 * What became of a send: it got through, or failed with the connection gone or changing while it
 * was on its way, so it is kept, or failed with the browser online throughout, so it is dropped.
 */
type Outcome = 'through' | 'offline' | 'online';

/** How many times the browser has said the connection went or came back. */
let changes = 0;

/** Counts a change of connection. */
const changed = (): void => {
    changes += 1;
};

/**
 * Starts watching a send, and gives what became of it should it fail. One that fails while the
 * browser is offline, or after the connection went or came back while it was on its way, is kept,
 * so a send made with no connection whose failure arrives once the connection is back is kept too.
 * Only one refused with the browser online throughout, as a blocker refuses it, is dropped.
 */
const watch = (): (() => Outcome) => {
    const before = changes;
    return () => (!navigator.onLine || changes !== before ? 'offline' : 'online');
};

/** Sends an event, and resolves to what became of it, once counting has started. */
let send: ((event: Kept) => Promise<Outcome>) | null = null;

/** Whether this page is sending, so it runs one round of sending at a time. */
let sending = false;

/** Whether an event was counted during a round, so another round follows it. */
let again = false;

/**
 * Sends the events waiting, oldest first. Each is taken off the list before it is sent, in one
 * change, so a page that closes with a send on its way, or another page sending at the same time,
 * never sends it again. One that fails with the connection gone or changing while it was on its way
 * is put back at the head of the list, to send when the connection returns. One that fails with the
 * browser online throughout, as a blocker makes it, is dropped, so the list never holds events that
 * can never be sent.
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
        const waiting = await theList();
        for (let taken = await waiting.take(); taken !== null; taken = await waiting.take()) {
            if ((await sendOne(taken.event)) !== 'offline') continue;
            await waiting.putBack(taken);
            return;
        }
    };
    void round()
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
    void theList()
        .then((waiting) => waiting.add(named === undefined ? { n: name } : { n: name, g: named }))
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
        window.addEventListener('online', changed);
        window.addEventListener('offline', changed);
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
    connection?.close();
    connection = null;
    list = null;
    window.removeEventListener('popstate', countMove);
    window.removeEventListener('online', sendKept);
    window.removeEventListener('online', changed);
    window.removeEventListener('offline', changed);
    changes = 0;
};
