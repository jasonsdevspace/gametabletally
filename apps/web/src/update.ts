/**
 * A newer build of the app, which the service worker installs beside the one running and keeps
 * waiting until the visitor agrees to it.
 *
 * The page watches the worker's registration for a worker that has installed and waits, and asks
 * the browser for a newer build each time the page is shown again, so a phone picked up the next
 * day finds one. A screen offers what is waiting, and agreeing hands the page to it: the waiting
 * worker is asked to take over, and the page reloads once it has.
 */

/** Nothing waiting, a build waiting, or a build waiting that this page cannot do without. */
export type UpdateState = 'none' | 'ready' | 'needed';

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
    if (waiting === null) return 'none';
    return needed ? 'needed' : 'ready';
};

/** Holds the worker that has installed and waits, until it moves on or is replaced. */
const track = (worker: Worker | null) => {
    // A first install has no build to replace, so a worker counts only beside one in charge.
    if (!worker || !workers?.controller) return;
    const settle = () => {
        if (worker.state === 'installed') waiting = worker;
        else if (waiting === worker) waiting = null;
        else return;
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

/** Hands the page to the waiting worker, and reloads it once that worker has taken over. */
export const applyUpdate = (): void => {
    if (!waiting || !workers || applying) return;
    applying = true;
    workers.addEventListener('controllerchange', page.reload, { once: true });
    waiting.postMessage('take over');
};
