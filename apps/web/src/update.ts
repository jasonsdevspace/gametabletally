import { hearNewer } from './store/newer.js';

/**
 * A newer build of the app, which the service worker installs beside the one running and keeps
 * waiting until the visitor agrees to it.
 *
 * The page watches the worker's registration for a worker that has installed and waits, and asks
 * the browser for a newer build each time the page is shown again, so a phone picked up the next
 * day finds one. A screen offers what is waiting, and agreeing hands the page to it: the waiting
 * worker is asked to take over, and the page reloads once it has.
 *
 * A worker that takes over takes over every tab of the app, so a tab that did not agree finds the
 * build it runs replaced, as it does when a newer build closes the database under it. Such a tab
 * reloads at once where it is hidden, and otherwise says so and waits for the visitor.
 */

/**
 * What the page has to offer, the most pressing first: a reload, once a newer build has closed
 * the database under it or taken over from another tab, or once a screen's file did not load, a
 * reload or the waiting build where the phone's games were saved by a newer one, the waiting
 * build, or nothing.
 */
export type UpdateState =
    'closed' | 'replaced' | 'missing' | 'reload' | 'needed' | 'ready' | 'none';

/** What the page reads of a worker. */
interface Worker extends EventTarget {
    readonly state: ServiceWorkerState;
    readonly postMessage: (message: unknown) => void;
}

/** What the page reads of the worker's registration. */
interface Registration extends EventTarget {
    readonly waiting: Worker | null;
    readonly installing: Worker | null;
    readonly update: () => Promise<unknown>;
}

/** What the page reads of its workers: the one in charge of it, which a first visit has none of. */
interface Workers extends EventTarget {
    readonly controller: unknown;
}

/** The page's own reload, which a test stands in for. */
export const page = {
    reload: (): void => {
        location.reload();
    },
};

let registration: Registration | null = null;
let workers: Workers | null = null;
let waiting: Worker | null = null;
let needed = false;
let applying = false;
/** How the build this page runs was replaced, where it was. */
let outdated: 'closed' | 'replaced' | 'missing' | null = null;
const listeners = new Set<() => void>();

const notify = () => {
    for (const listener of listeners) listener();
};

/** Asks the browser whether the server holds a newer build, which it installs where it does. */
const check = () => {
    registration?.update().catch(() => undefined);
};

export const subscribeUpdate = (listener: () => void): (() => void) => {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
};

export const updateState = (): UpdateState => {
    if (outdated) return outdated;
    // A page a newer database refused with no newer worker to hand it to can still reload, which a
    // page no worker serves takes from the network.
    if (needed) return waiting && workers?.controller ? 'needed' : 'reload';
    return waiting ? 'ready' : 'none';
};

/**
 * Marks the build this page runs as replaced, and reloads at once where the page is hidden, since
 * no one is reading it.
 */
const replace = (how: 'closed' | 'replaced') => {
    if (document.visibilityState === 'hidden') {
        page.reload();
        return;
    }
    if (outdated !== 'closed') outdated = how;
    notify();
};

/** Holds the worker that has installed and waits, until it moves on or is replaced. */
const track = (worker: Worker | null) => {
    // A first install has no build to replace, so a worker counts only beside one in charge.
    if (!worker || !workers?.controller) return;
    const settle = () => {
        if (worker.state === 'installed' && waiting !== worker) {
            // A newer worker in the place of one agreed to is offered afresh.
            applying = false;
            waiting = worker;
        } else if (worker.state !== 'installed' && waiting === worker) {
            waiting = null;
            // One that was replaced will never take over, so the next can be agreed to. One that
            // is taking over keeps the page waiting to reload.
            if (worker.state === 'redundant') applying = false;
        } else return;
        notify();
    };
    worker.addEventListener('statechange', settle);
    settle();
};

/** Watches the registration the page holds, and the page's workers, for a newer build. */
export const watchUpdates = (
    found: Registration,
    container: Workers = navigator.serviceWorker
): void => {
    if (!registration)
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') check();
        });
    registration = found;
    workers = container;
    waiting = null;
    needed = false;
    applying = false;
    // A screen whose file did not load before the worker's registration was found still offers
    // its reload.
    if (outdated !== 'missing') outdated = null;
    // A first visit's worker taking charge is no newer build, so only a change from one in charge
    // is. The page that agreed reloads into it, and any other is told.
    let controlled = Boolean(container.controller);
    container.addEventListener('controllerchange', () => {
        if (applying) page.reload();
        else if (controlled) replace('replaced');
        applying = false;
        controlled = true;
    });
    track(found.waiting);
    track(found.installing);
    found.addEventListener('updatefound', () => {
        track(found.installing);
    });
    notify();
};

/**
 * Marks the waiting build as one the page cannot do without, as when the phone's games were saved
 * by it, and asks for it where it has not been found yet.
 */
export const updateNeeded = (): void => {
    if (needed) return;
    needed = true;
    check();
    notify();
};

/**
 * Marks a screen's file as one that did not load with the browser online, as when a newer build
 * took it off the server or the connection let it down, so the page offers a reload.
 */
export const screenMissing = (): void => {
    if (outdated !== null) return;
    outdated = 'missing';
    notify();
};

/** Takes the reload away once a screen has loaded after all, as on the next move. */
export const screenFound = (): void => {
    if (outdated !== 'missing') return;
    outdated = null;
    notify();
};

/** Hands the page to the waiting worker, and reloads it once that worker has taken over. */
export const applyUpdate = (): void => {
    if (!waiting || applying) return;
    applying = true;
    waiting.postMessage('take over');
};

hearNewer((how) => {
    if (how === 'refused') updateNeeded();
    else replace('closed');
});
