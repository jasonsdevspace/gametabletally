import { afterEach, describe, expect, it, vi } from 'vitest';

import { counts, countVisits, DOMAIN, pathsOnly, stopCounting } from './analytics.js';
import { navigate } from './navigation.js';

/* Page views counted on the live address only, by path alone, and never in the way of the app. */

const live = { hostname: DOMAIN };

/** A tracker that records what it was started with and each page view it was asked to send. */
const tracker = () => {
    const init = vi.fn();
    const track = vi.fn();
    return { init, track, load: () => Promise.resolve({ init, track }) };
};

afterEach(() => {
    stopCounting();
    window.history.replaceState(null, '', '/');
});

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
    it('starts the tracker for the domain on the live address, counting the page it is on', async () => {
        const { init, track, load } = tracker();
        expect(await countVisits(live, {}, load)).toBe(true);
        expect(init).toHaveBeenCalledWith({
            domain: 'gametabletally.com',
            transformRequest: pathsOnly,
            autoCapturePageviews: false,
            bindToWindow: false,
            logging: false,
        });
        expect(track).toHaveBeenCalledTimes(1);
        expect(track).toHaveBeenCalledWith('pageview', {});
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
        expect(await countVisits(live, {}, () => Promise.resolve({ init, track: vi.fn() }))).toBe(
            false
        );
    });
});

describe('counting moves between screens', () => {
    it('counts a move that adds to the history and one that replaces the address alike', async () => {
        const { track, load } = tracker();
        await countVisits(live, {}, load);
        navigate('/new/');
        navigate('/game/?id=g-1', { replace: true });
        expect(track).toHaveBeenCalledTimes(3);
    });

    it('counts a move that changes only the query once, since it is sent as the same page', async () => {
        const { track, load } = tracker();
        await countVisits(live, {}, load);
        navigate('/game/?id=g-1');
        navigate('/game/?id=g-1&round=2', { replace: true });
        expect(track).toHaveBeenCalledTimes(2);
    });

    it('counts Back and Forward', async () => {
        const { track, load } = tracker();
        await countVisits(live, {}, load);
        window.history.pushState(null, '', '/about/');
        window.dispatchEvent(new PopStateEvent('popstate'));
        expect(track).toHaveBeenCalledTimes(2);
    });

    it('counts nothing on a move before counting has started, or where it never starts', () => {
        const { track } = tracker();
        navigate('/play/');
        expect(track).not.toHaveBeenCalled();
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

    it("reads a page's own file as its address, for the page and the page before it", () => {
        const sent = pathsOnly({
            n: 'pageview',
            u: 'https://gametabletally.com/about/index.html',
            d: DOMAIN,
            r: 'https://gametabletally.com/play/index.html',
        });
        expect(sent).toMatchObject({
            u: 'https://gametabletally.com/about/',
            r: 'https://gametabletally.com/play/',
        });
    });

    it('sends any other path of the app as the not-found page, so nothing typed into it is sent', () => {
        const sent = pathsOnly({
            n: 'pageview',
            u: 'https://gametabletally.com/player/Alice',
            d: DOMAIN,
            r: 'https://gametabletally.com/game/7d1e/',
        });
        expect(sent).toMatchObject({
            u: 'https://gametabletally.com/404.html',
            r: 'https://gametabletally.com/404.html',
        });
    });

    it('sends a referrer from elsewhere by its origin and path, and cuts one that is no web address at its query', () => {
        const from = (r: string) =>
            pathsOnly({ n: 'pageview', u: 'https://gametabletally.com/', d: DOMAIN, r })?.r;
        expect(from('https://example.com/games/list?q=flip#top')).toBe(
            'https://example.com/games/list'
        );
        expect(from('android-app://com.google.android.gm/?account=me')).toBe(
            'android-app://com.google.android.gm/'
        );
        expect(from('not an address')).toBeNull();
    });

    it('sends nothing for a page whose address cannot be read', () => {
        expect(pathsOnly({ n: 'pageview', u: 'nowhere', d: DOMAIN, r: null })).toBeNull();
    });
});
