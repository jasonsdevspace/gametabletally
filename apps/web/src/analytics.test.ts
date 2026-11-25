import type { PlausibleEventOptions } from '@plausible-analytics/tracker';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    countEvent,
    counts,
    countVisits,
    DOMAIN,
    KEPT,
    MOST_KEPT,
    pathsOnly,
    stopCounting,
} from './analytics.js';
import { navigate } from './navigation.js';

/*
 * Page views and the three events counted on the live address only, by path alone, with the game's
 * name the only thing an event carries, events made with no connection kept and sent later, and
 * never in the way of the app.
 */

const live = { hostname: DOMAIN };

/** A tracker that records what it was started with and each page view it was asked to send. */
const tracker = () => {
    const init = vi.fn();
    const track = vi.fn<(name: string, options: PlausibleEventOptions) => void>();
    return { init, track, load: () => Promise.resolve({ init, track }) };
};

/**
 * A tracker over a connection the test turns off and on, which records each event that gets
 * through by its name and what it carries, and answers each send as Plausible or a lost
 * connection would.
 */
const network = () => {
    const sent: { name: string; props: unknown }[] = [];
    let connected = true;
    const track = vi.fn((name: string, options: PlausibleEventOptions) => {
        if (connected && name !== 'pageview') sent.push({ name, props: options.props });
        options.callback?.(
            connected ? { status: 202 } : { error: new TypeError('Failed to fetch') }
        );
    });
    return {
        sent,
        load: () => Promise.resolve({ init: vi.fn(), track }),
        lose: () => {
            connected = false;
        },
        /** Gets the connection back without the browser saying so. */
        recover: () => {
            connected = true;
        },
        /** Gets the connection back, as the browser says when it does. */
        reconnect: () => {
            connected = true;
            window.dispatchEvent(new Event('online'));
        },
    };
};

/** The events kept on the phone, as stored. */
const kept = (): unknown => JSON.parse(localStorage.getItem(KEPT) ?? '[]');

afterEach(() => {
    stopCounting();
    localStorage.clear();
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
        expect(track.mock.calls.map(([name, options]) => [name, Object.keys(options)])).toEqual([
            ['pageview', ['callback']],
        ]);
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

describe('the events counted', () => {
    it("counts a game started and a game finished with the game's name and nothing else", async () => {
        const { sent, load } = network();
        await countVisits(live, {}, load);
        countEvent('Game started', 'flip-7', live, {});
        countEvent('Game finished', 'skyjo', live, {});
        expect(sent).toEqual([
            { name: 'Game started', props: { game: 'Flip 7' } },
            { name: 'Game finished', props: { game: 'Skyjo' } },
        ]);
        expect(kept()).toEqual([]);
    });

    it('counts an install with nothing beside it', async () => {
        const { sent, load } = network();
        await countVisits(live, {}, load);
        countEvent('Install', undefined, live, {});
        expect(sent).toEqual([{ name: 'Install', props: undefined }]);
    });

    it('counts nothing for a game the app does not know, so nothing typed is ever sent', async () => {
        const { sent, load } = network();
        await countVisits(live, {}, load);
        countEvent('Game started', 'Alice', live, {});
        expect(sent).toEqual([]);
        expect(kept()).toEqual([]);
    });

    it('keeps nothing and sends nothing where a visit does not count', async () => {
        const { sent, load } = network();
        await countVisits(live, {}, load);
        countEvent('Game started', 'flip-7', { hostname: 'localhost' }, {});
        countEvent('Install', undefined, live, { globalPrivacyControl: true });
        expect(sent).toEqual([]);
        expect(localStorage.getItem(KEPT)).toBeNull();
    });
});

describe('events made with no connection', () => {
    it('are kept on the phone and sent when the connection returns', async () => {
        const { sent, load, lose, reconnect } = network();
        await countVisits(live, {}, load);
        lose();
        countEvent('Game started', 'wizard', live, {});
        countEvent('Game finished', 'wizard', live, {});
        expect(sent).toEqual([]);
        expect(kept()).toEqual([
            ['Game started', 'Wizard'],
            ['Game finished', 'Wizard'],
        ]);
        reconnect();
        expect(sent).toEqual([
            { name: 'Game started', props: { game: 'Wizard' } },
            { name: 'Game finished', props: { game: 'Wizard' } },
        ]);
        expect(kept()).toEqual([]);
    });

    it('are sent once a page view gets through, where the browser never said the connection was lost', async () => {
        const { sent, load, lose, recover } = network();
        await countVisits(live, {}, load);
        lose();
        countEvent('Install', undefined, live, {});
        recover();
        navigate('/play/');
        expect(sent).toEqual([{ name: 'Install', props: undefined }]);
        expect(kept()).toEqual([]);
    });

    it('are sent by the next visit, made before the tracker starts', async () => {
        countEvent('Game started', 'skyjo', live, {});
        expect(kept()).toEqual([['Game started', 'Skyjo']]);
        const { sent, load } = network();
        await countVisits(live, {}, load);
        expect(sent).toEqual([{ name: 'Game started', props: { game: 'Skyjo' } }]);
    });

    it('are kept up to the limit, and past it the newest are dropped', async () => {
        const { sent, load, lose, reconnect } = network();
        await countVisits(live, {}, load);
        lose();
        for (let at = 0; at < MOST_KEPT; at += 1) countEvent('Game started', 'flip-7', live, {});
        countEvent('Game finished', 'flip-7', live, {});
        countEvent('Install', undefined, live, {});
        expect(kept()).toHaveLength(MOST_KEPT);
        reconnect();
        expect(sent).toHaveLength(MOST_KEPT);
        expect(sent.every(({ name }) => name === 'Game started')).toBe(true);
    });

    it('send nothing from a kept list changed on the phone but the three events, each with a game the app knows', async () => {
        localStorage.setItem(
            KEPT,
            JSON.stringify([
                ['Game started', 'Alice'],
                ['Score', 229],
                ['Install', 'g-7d1e'],
                'Game started',
                ['Game finished', 'Wizard'],
            ])
        );
        const { sent, load } = network();
        await countVisits(live, {}, load);
        expect(sent).toEqual([{ name: 'Game finished', props: { game: 'Wizard' } }]);
    });

    it('send nothing from a kept list that is not one', async () => {
        localStorage.setItem(KEPT, '{not a list');
        const { sent, load } = network();
        expect(await countVisits(live, {}, load)).toBe(true);
        expect(sent).toEqual([]);
    });
});
