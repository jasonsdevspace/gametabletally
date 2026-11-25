/**
 * A module the app loads when it is first needed, such as a screen's code, read by a component with
 * React's `use`. The promise carries its own state as React reads it, so a module that has arrived
 * draws at once, in the prerender and in the page's first draw alike, with no wait for a fallback.
 *
 * A load that fails is marked as a module that did not arrive, so the screen that asked can say
 * why. The failure is kept until the screen has said so, since React asks again as it draws the
 * failure, and then forgotten, so the next ask, such as the next move to the screen, loads it
 * afresh. One fetched ahead that fails is forgotten at once, since no screen has asked for it.
 */

/** A promise with the state React's `use` reads, so one already settled is read at once. */
type Tracked<T> = Promise<T> & {
    status?: 'pending' | 'fulfilled' | 'rejected';
    value?: T;
    reason?: unknown;
};

/** A module that did not arrive, as when the build that listed it has gone from the server. */
export class NotLoaded extends Error {
    override readonly name = 'NotLoaded';
}

/** A module to load once, with the promise React reads and a way to start it early. */
export interface Loader<T> {
    /** The module's promise, started on the first ask. */
    readonly load: () => Promise<T>;
    /** Starts the load where it has not started, and lets a failure go, to be tried on the next ask. */
    readonly prefetch: () => void;
}

/** Each loader's way to forget a load that failed. */
const forgetters = new Set<() => void>();

/** Forgets every load that failed, once the screen that asked has said so, so the next ask retries. */
export const forgetFailedLoads = (): void => {
    for (const forget of forgetters) forget();
};

/** A module loaded once, on the first ask, and afresh after a failed load is forgotten. */
export const loader = <T>(load: () => Promise<T>): Loader<T> => {
    let tracked: Tracked<T> | null = null;
    const forget = (failed: Tracked<T>) => {
        if (tracked === failed) tracked = null;
    };
    forgetters.add(() => {
        if (tracked?.status === 'rejected') tracked = null;
    });
    const start = (): Tracked<T> => {
        if (tracked) return tracked;
        const promise: Tracked<T> = load().then(
            (value) => {
                promise.status = 'fulfilled';
                promise.value = value;
                return value;
            },
            (reason: unknown) => {
                const error = new NotLoaded('The code for this screen could not be loaded.', {
                    cause: reason,
                });
                promise.status = 'rejected';
                promise.reason = error;
                throw error;
            }
        );
        promise.status = 'pending';
        tracked = promise;
        return promise;
    };
    return {
        load: start,
        prefetch: () => {
            const promise = start();
            promise.catch(() => {
                forget(promise);
            });
        },
    };
};
