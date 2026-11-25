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
 * through by its name and what it carries, and answers each send as Plausible, a lost connection
 * or a blocker would. The browser says it is offline only while the connection is lost, not while
 * a blocker refuses the sends, and a send can be held unanswered, as one is while a page closes.
 */
const network = () => {
    const sent: { name: string; props: unknown }[] = [];
    let connected = true;
    let online = true;
    let holding = false;
    let late: (() => void)[] | null = null;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
    const track = vi.fn((name: string, options: PlausibleEventOptions) => {
        if (holding) return;
        if (connected && name !== 'pageview') sent.push({ name, props: options.props });
        const result = connected ? { status: 202 } : { error: new TypeError('Failed to fetch') };
        const reply = () => options.callback?.(result);
        if (late === null) reply();
        else late.push(reply);
    });
    return {
        sent,
        track,
        load: () => Promise.resolve({ init: vi.fn(), track }),
        lose: () => {
            connected = false;
            online = false;
        },
        /** Refuses every send while the browser is still online, as a blocker does. */
        block: () => {
            connected = false;
        },
        /** Leaves every send unanswered, as a page that closes leaves the one on its way. */
        hold: () => {
            holding = true;
        },
        /** Holds each answer back until `answer`, as a slow connection does. */
        slow: () => {
            late = [];
        },
        /** Gives every answer held back, each as it would have been when its send was made. */
        answer: () => {
            const replies = late ?? [];
            late = null;
            for (const reply of replies) reply();
        },
        /** Gets the connection back without the browser firing its event. */
        recover: () => {
            connected = true;
            online = true;
        },
        /** Gets the connection back, as the browser says when it does. */
        reconnect: () => {
            connected = true;
            online = true;
            window.dispatchEvent(new Event('online'));
        },
    };
};

/** The events kept on the phone, as stored, each by its name and its game's name. */
const kept = (): unknown[] => {
    const read: unknown = JSON.parse(localStorage.getItem(KEPT) ?? '[]');
    return Array.isArray(read)
        ? read.map((entry: { n?: unknown; g?: unknown }) =>
              entry.g === undefined ? [entry.n] : [entry.n, entry.g]
          )
        : [];
};

/** Lets every send under way finish, so a test can check what was not sent. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** Entries as a page writes them, each with its own id. */
const stored = (entries: readonly (readonly [string] | readonly [string, string])[]) =>
    JSON.stringify(
        entries.map(([n, g], at) => (g === undefined ? { i: `e${at}`, n } : { i: `e${at}`, n, g }))
    );

afterEach(() => {
    stopCounting();
    vi.restoreAllMocks();
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
        await vi.waitFor(() => {
            expect(sent).toEqual([
                { name: 'Game started', props: { game: 'Flip 7' } },
                { name: 'Game finished', props: { game: 'Skyjo' } },
            ]);
        });
        expect(kept()).toEqual([]);
    });

    it('counts an install with nothing beside it', async () => {
        const { sent, load } = network();
        await countVisits(live, {}, load);
        countEvent('Install', undefined, live, {});
        await vi.waitFor(() => {
            expect(sent).toEqual([{ name: 'Install', props: undefined }]);
        });
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

    it('forgets the events kept once the browser sends Global Privacy Control', async () => {
        localStorage.setItem(KEPT, stored([['Install']]));
        countEvent('Install', undefined, live, { globalPrivacyControl: true });
        expect(localStorage.getItem(KEPT)).toBeNull();
        localStorage.setItem(KEPT, stored([['Install']]));
        expect(await countVisits(live, { globalPrivacyControl: true }, network().load)).toBe(false);
        expect(localStorage.getItem(KEPT)).toBeNull();
    });

    it('sends an event where the browser will not store it', async () => {
        const { sent, load } = network();
        await countVisits(live, {}, load);
        vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
        });
        countEvent('Game started', 'wizard', live, {});
        await vi.waitFor(() => {
            expect(sent).toEqual([{ name: 'Game started', props: { game: 'Wizard' } }]);
        });
    });
});

describe('events made with no connection', () => {
    it('are kept on the phone and sent when the connection returns', async () => {
        const { sent, load, lose, reconnect } = network();
        await countVisits(live, {}, load);
        lose();
        countEvent('Game started', 'wizard', live, {});
        countEvent('Game finished', 'wizard', live, {});
        await vi.waitFor(() => {
            expect(kept()).toEqual([
                ['Game started', 'Wizard'],
                ['Game finished', 'Wizard'],
            ]);
        });
        expect(sent).toEqual([]);
        reconnect();
        await vi.waitFor(() => {
            expect(sent).toEqual([
                { name: 'Game started', props: { game: 'Wizard' } },
                { name: 'Game finished', props: { game: 'Wizard' } },
            ]);
        });
        expect(kept()).toEqual([]);
    });

    it('are sent once a page view gets through, where the browser never fired its event', async () => {
        const { sent, load, lose, recover } = network();
        await countVisits(live, {}, load);
        lose();
        countEvent('Install', undefined, live, {});
        await vi.waitFor(() => {
            expect(kept()).toEqual([['Install']]);
        });
        recover();
        navigate('/play/');
        await vi.waitFor(() => {
            expect(sent).toEqual([{ name: 'Install', props: undefined }]);
        });
        expect(kept()).toEqual([]);
    });

    it('are sent by the next visit, made before the tracker starts', async () => {
        countEvent('Game started', 'skyjo', live, {});
        expect(kept()).toEqual([['Game started', 'Skyjo']]);
        const { sent, load } = network();
        await countVisits(live, {}, load);
        await vi.waitFor(() => {
            expect(sent).toEqual([{ name: 'Game started', props: { game: 'Skyjo' } }]);
        });
    });

    it('are kept up to the limit, and past it the newest are dropped', async () => {
        const { sent, load, lose, reconnect } = network();
        await countVisits(live, {}, load);
        lose();
        for (let at = 0; at < MOST_KEPT; at += 1) countEvent('Game started', 'flip-7', live, {});
        countEvent('Game finished', 'flip-7', live, {});
        countEvent('Install', undefined, live, {});
        await vi.waitFor(() => {
            expect(kept()).toHaveLength(MOST_KEPT);
        });
        reconnect();
        await vi.waitFor(() => {
            expect(sent).toHaveLength(MOST_KEPT);
        });
        expect(sent.every(({ name }) => name === 'Game started')).toBe(true);
    });

    it('send no more than the limit from a longer list read back', async () => {
        localStorage.setItem(
            KEPT,
            stored(Array.from({ length: MOST_KEPT + 10 }, () => ['Install'] as const))
        );
        const { sent, load } = network();
        await countVisits(live, {}, load);
        await vi.waitFor(() => {
            expect(kept()).toEqual([]);
        });
        expect(sent).toHaveLength(MOST_KEPT);
    });

    it('are kept when a send made with no connection fails only once the connection is back', async () => {
        const { sent, load, lose, slow, answer, reconnect } = network();
        await countVisits(live, {}, load);
        await settle();
        lose();
        slow();
        countEvent('Install', undefined, live, {});
        reconnect();
        answer();
        await vi.waitFor(() => {
            expect(sent).toEqual([{ name: 'Install', props: undefined }]);
        });
        expect(kept()).toEqual([]);
    });

    it('are dropped once a blocker refuses them with the connection back, though kept while it was gone', async () => {
        const { sent, track, load, lose, slow, answer, reconnect, block } = network();
        await countVisits(live, {}, load);
        await settle();
        lose();
        slow();
        countEvent('Install', undefined, live, {});
        reconnect();
        block();
        answer();
        await vi.waitFor(() => {
            expect(track.mock.calls.filter(([name]) => name === 'Install')).toHaveLength(2);
        });
        await settle();
        expect(kept()).toEqual([]);
        expect(sent).toEqual([]);
    });

    it('are dropped when a send fails while the browser is online, as a blocker makes it', async () => {
        const { sent, load, block, recover } = network();
        await countVisits(live, {}, load);
        block();
        countEvent('Game finished', 'skyjo', live, {});
        await vi.waitFor(() => {
            expect(kept()).toEqual([]);
        });
        recover();
        navigate('/play/');
        await settle();
        expect(sent).toEqual([]);
    });

    it('are not sent again by the next visit once one is on its way as the page closes', async () => {
        const first = network();
        await countVisits(live, {}, first.load);
        first.hold();
        countEvent('Install', undefined, live, {});
        // The send is on its way, unanswered, when the page closes.
        await vi.waitFor(() => {
            expect(first.track).toHaveBeenCalledWith('Install', expect.anything());
        });
        stopCounting();
        const next = network();
        await countVisits(live, {}, next.load);
        navigate('/play/');
        await settle();
        expect(next.sent).toEqual([]);
        expect(kept()).toEqual([]);
    });

    it('send nothing from a kept list changed on the phone but the three events, each with a game the app knows', async () => {
        localStorage.setItem(
            KEPT,
            JSON.stringify([
                { i: 'a', n: 'Game started', g: 'Alice' },
                { i: 'b', n: 'Score', g: 229 },
                { i: 'c', n: 'Install', g: 'g-7d1e' },
                'Game started',
                ['Game finished', 'Wizard'],
                { n: 'Install' },
                { i: 'd', n: 'Game finished', g: 'Wizard' },
            ])
        );
        const { sent, load } = network();
        await countVisits(live, {}, load);
        await vi.waitFor(() => {
            expect(kept()).toEqual([]);
        });
        expect(sent).toEqual([{ name: 'Game finished', props: { game: 'Wizard' } }]);
    });

    it('send nothing from a kept list that is not one', async () => {
        localStorage.setItem(KEPT, '{not a list');
        const { sent, load } = network();
        expect(await countVisits(live, {}, load)).toBe(true);
        expect(sent).toEqual([]);
    });
});
