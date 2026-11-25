/*
 * Word of a newer build of the app that has the database, kept apart from the store so every page
 * can listen for it without loading the store's code, which only the app's screens and the about
 * page's backup need.
 */

/** How a newer build has the database: it refused this page, or closed the store under it. */
export type Newer = 'refused' | 'closed';

const hearing = new Set<(how: Newer) => void>();

/**
 * Hears each time a newer build has the database, refusing a page that opens it or closing a store
 * as it upgrades, so the app can offer that build or reload into it. Returns what stops hearing.
 */
export const hearNewer = (listener: (how: Newer) => void): (() => void) => {
    hearing.add(listener);
    return () => {
        hearing.delete(listener);
    };
};

export const tell = (how: Newer) => {
    for (const listener of hearing) listener(how);
};
