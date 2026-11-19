import { describe, expect, it, vi } from 'vitest';

import { counts, countVisits, DOMAIN, pathsOnly } from './analytics.js';

/* Page views counted on the live address only, by path alone, and never in the way of the app. */

const live = { hostname: DOMAIN };

describe('where a visit counts', () => {
    it('counts on the live address and nowhere else', () => {
        expect(counts(live, {})).toBe(true);
        for (const hostname of ['localhost', '127.0.0.1', 'www.gametabletally.com', 'example.com'])
            expect(counts({ hostname }, {})).toBe(false);
    });

    it('counts nothing for a visitor whose browser sends Global Privacy Control', () => {
        expect(counts(live, { globalPrivacyControl: true })).toBe(false);
        expect(counts(live, { globalPrivacyControl: false })).toBe(true);
    });
});

describe('starting the count', () => {
    it('starts the tracker for the domain on the live address, sending paths only', async () => {
        const init = vi.fn();
        expect(await countVisits(live, {}, () => Promise.resolve({ init }))).toBe(true);
        expect(init).toHaveBeenCalledWith({
            domain: 'gametabletally.com',
            transformRequest: pathsOnly,
            bindToWindow: false,
            logging: false,
        });
    });

    it('never loads the tracker where a visit does not count', async () => {
        const load = vi.fn();
        expect(await countVisits({ hostname: 'localhost' }, {}, load)).toBe(false);
        expect(await countVisits(live, { globalPrivacyControl: true }, load)).toBe(false);
        expect(load).not.toHaveBeenCalled();
    });

    it('leaves the app as it was when the tracker is blocked or cannot start', async () => {
        expect(await countVisits(live, {}, () => Promise.reject(new Error('blocked')))).toBe(false);
        const init = () => {
            throw new Error('no fetch');
        };
        expect(await countVisits(live, {}, () => Promise.resolve({ init }))).toBe(false);
    });
});

describe('what a page view sends', () => {
    it("sends a game's page without its id, and the page before it the same way", () => {
        const sent = pathsOnly({
            n: 'pageview',
            u: 'https://gametabletally.com/recap/?id=7d1e#standings',
            d: DOMAIN,
            r: 'https://gametabletally.com/game/?id=7d1e&round=2',
        });
        expect(sent).toEqual({
            n: 'pageview',
            u: 'https://gametabletally.com/recap/',
            d: DOMAIN,
            r: 'https://gametabletally.com/game/',
        });
        expect(JSON.stringify(sent)).not.toContain('7d1e');
    });

    it("reads a page's own file as its address, and keeps any other path as it is", () => {
        const page = (u: string) => pathsOnly({ n: 'pageview', u, d: DOMAIN, r: null })?.u;
        expect(page('https://gametabletally.com/about/index.html')).toBe(
            'https://gametabletally.com/about/'
        );
        expect(page('https://gametabletally.com/nowhere?x=1')).toBe(
            'https://gametabletally.com/nowhere'
        );
    });

    it('cuts a referrer that is no web address at its query, and sends none for one that is no address', () => {
        const from = (r: string) =>
            pathsOnly({ n: 'pageview', u: 'https://gametabletally.com/', d: DOMAIN, r })?.r;
        expect(from('android-app://com.google.android.gm/?account=me')).toBe(
            'android-app://com.google.android.gm/'
        );
        expect(from('not an address')).toBeNull();
    });

    it('sends nothing for a page whose address cannot be read', () => {
        expect(pathsOnly({ n: 'pageview', u: 'nowhere', d: DOMAIN, r: null })).toBeNull();
    });
});
