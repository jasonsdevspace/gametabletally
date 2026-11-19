import type * as Tracker from '@plausible-analytics/tracker';
import type { PlausibleRequestPayload } from '@plausible-analytics/tracker';

import { NOT_FOUND_FILE, routeAt } from './routes.js';

/**
 * Counts page views with Plausible, on the live address only, so the dev server, the browser
 * tests and the Lighthouse audits are never counted. Nothing is stored on the phone, no cookie is
 * set, and a visitor whose browser sends Global Privacy Control is not counted at all.
 *
 * A page is sent by its address alone, with no query and no fragment, so the id of a game or a
 * player never leaves the phone, and a path that is no address of the app is sent as the
 * not-found page, so nothing typed into one is sent either. The page before it is sent the same
 * way. The first page is counted once the page has loaded, and every move after it is counted by
 * the app's own move between screens and by Back and Forward, so a move that replaces the address
 * counts as one that adds to it. The tracker is loaded only once a visit is to be counted, and a
 * tracker that cannot load or start, or a request a blocker stops, leaves the app as it was.
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
        count = () => {
            track('pageview', {});
        };
        window.addEventListener('popstate', countMove);
        countMove();
        return true;
    } catch {
        // A tracker a blocker stopped, or a browser without what it needs, counts nothing.
        return false;
    }
};

/** Forgets that counting started, for the tests. */
export const stopCounting = (): void => {
    count = null;
    last = null;
    window.removeEventListener('popstate', countMove);
};
