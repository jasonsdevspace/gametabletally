import type * as Tracker from '@plausible-analytics/tracker';
import type { PlausibleRequestPayload } from '@plausible-analytics/tracker';

import { routeAt } from './routes.js';

/**
 * Counts page views with Plausible, on the live address only, so the dev server, the browser
 * tests and the Lighthouse audits are never counted. Nothing is stored on the phone, no cookie is
 * set, and a visitor whose browser sends Global Privacy Control is not counted at all.
 *
 * A page is sent by its address alone, with no query and no fragment, so the id of a game or a
 * player never leaves the phone. The page before it is sent the same way. The tracker is loaded
 * only once a visit is to be counted, and a tracker that cannot load or start, or a request a
 * blocker stops, leaves the app as it was. A move between screens is counted as the tracker sees
 * the address change.
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
 * An address without its query or fragment, or nothing when it is no address. A web address keeps
 * its origin and path, and another kind, such as the referrer an app on a phone gives, is cut at
 * its query.
 */
const pathOnly = (address: string): string | null => {
    const url = parsed(address);
    if (!url) return null;
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
        return address.replace(/[?#].*$/s, '');
    return `${url.origin}${url.pathname}`;
};

/**
 * What is sent for a page view, with the page and the page before it cut back to their paths, a
 * page's own file read as its address, or nothing when the page's address cannot be read. It never
 * throws, since the tracker calls it from its own listeners.
 */
export const pathsOnly = (payload: PlausibleRequestPayload): PlausibleRequestPayload | null => {
    const url = parsed(payload.u);
    if (!url) return null;
    const path = routeAt(url.pathname)?.path ?? url.pathname;
    return { ...payload, u: `${url.origin}${path}`, r: payload.r ? pathOnly(payload.r) : null };
};

/** Whether a visit is counted: on the live address, from a browser that allows it. */
export const counts = (where: Pick<Location, 'hostname'>, browser: object): boolean =>
    where.hostname === DOMAIN &&
    !('globalPrivacyControl' in browser && browser.globalPrivacyControl === true);

/** Starts counting where a visit counts, and says whether it did. */
export const countVisits = async (
    where: Pick<Location, 'hostname'> = location,
    browser: object = navigator,
    load: () => Promise<Pick<typeof Tracker, 'init'>> = () => import('@plausible-analytics/tracker')
): Promise<boolean> => {
    if (!counts(where, browser)) return false;
    try {
        const { init } = await load();
        init({
            domain: DOMAIN,
            transformRequest: pathsOnly,
            // The tracker would otherwise set window.plausible and warn in the console.
            bindToWindow: false,
            logging: false,
        });
        return true;
    } catch {
        // A tracker a blocker stopped, or a browser without what it needs, counts nothing.
        return false;
    }
};
