import type { ToastAction } from '@jasonsdevspace/design-kit/controls';
import { IDBFactory } from 'fake-indexeddb';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FORMAT_VERSION } from '../store/format.js';
import { NEWER_DATABASE, openStore } from '../store/store.js';
import { page, screenFound, screenMissing, watchUpdates } from '../update.js';
import { AppFrame } from './AppFrame.js';
import { noWakeLock, setShown } from './awake.testing.js';
import { useToast } from './frame-places.js';
import { act, appLine, render, screen, waitFor } from './render.testing.js';

/*
 * When the app offers a new version, by the screen that is open, with stand-ins for the service
 * worker's registration and the workers it holds, so a newer build is waiting whenever a test says.
 */

/** A worker of a newer build, at the state it has reached, and what the page sends it. */
class StandInWorker extends EventTarget {
    readonly postMessage = vi.fn();

    constructor(public state: ServiceWorkerState) {
        super();
    }

    /** Moves on to a later state, as the browser moves a worker through its install. */
    become(state: ServiceWorkerState): void {
        this.state = state;
        this.dispatchEvent(new Event('statechange'));
    }
}

/** The registration the page holds, with the worker waiting or installing in it. */
class StandInRegistration extends EventTarget {
    waiting: StandInWorker | null = null;
    installing: StandInWorker | null = null;
    readonly update = vi.fn(() => Promise.resolve());

    /** A newer build found by the browser, starting its install. */
    found(worker: StandInWorker): void {
        this.installing = worker;
        this.dispatchEvent(new Event('updatefound'));
    }
}

/** The page's view of its workers: the one in charge of it, and its change of hands. */
class StandInWorkers extends EventTarget {
    controller: object | null = {};

    /** Another worker takes charge of the page, as one does when any tab agrees to it. */
    handOver(): void {
        this.controller = {};
        this.dispatchEvent(new Event('controllerchange'));
    }
}

const OFFER = 'A new version of the app is ready.';
const OFFERED = `${OFFER} Update is available.`;
const NOTICE =
    'The app was updated in another tab. Reload this page to keep scoring. Reload is available.';
const RELOAD_ONLY = 'The games on this phone need a newer version of the app. Reload is available.';

/** The toast's own status line, where a shown message is said. */
const toastLine = (): HTMLElement => {
    const line = document.querySelector<HTMLElement>('.dk-app-toast [role="status"]');
    if (!line) throw new Error('The toast is not on the page.');
    return line;
};

/**
 * The message the toast shows this moment, or nothing where it shows none. Its line says a message
 * a moment after it shows, so a check that nothing shows reads the toast itself.
 */
const shownNow = (): string =>
    document.querySelector('.dk-toast[data-shown] .dk-toast-message')?.textContent ?? '';

const press = (name: string) => {
    act(() => {
        screen.getByRole('button', { name }).click();
    });
};

/** A registration and its page's workers, watched as the app watches its own. */
const watched = (
    waiting: StandInWorker | null = new StandInWorker('installed'),
    controller: object | null = {}
) => {
    const registration = new StandInRegistration();
    const workers = new StandInWorkers();
    workers.controller = controller;
    registration.waiting = waiting;
    watchUpdates(registration, workers);
    return { registration, workers };
};

/** A screen's button that shows a message in the frame's toast, with an action or none. */
const Saver = ({ words, action }: { readonly words: string; readonly action?: ToastAction }) => {
    const show = useToast();
    return (
        <button type="button" onClick={() => show(words, action)}>
            Save
        </button>
    );
};

const frameAt = (screenName: string, search = '', body: ReactNode = null) => (
    <AppFrame screen={screenName} search={search} title={screenName}>
        {body}
    </AppFrame>
);

/** Opens the database at the next version, as a newer build in another tab does. */
const upgradeIn = (factory: IDBFactory) =>
    new Promise<void>((resolve) => {
        const opening = factory.open('gametabletally', FORMAT_VERSION + 1);
        opening.onsuccess = () => {
            opening.result.close();
            resolve();
        };
    });

let reload: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    reload = vi.spyOn(page, 'reload').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    noWakeLock();
});

describe('offering a new version', () => {
    it('offers a waiting version in the toast, and applies it only when the visitor agrees', async () => {
        const worker = new StandInWorker('installed');
        const { workers } = watched(worker);
        render(frameAt('play'));
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
        expect(worker.postMessage).not.toHaveBeenCalled();
        press('Update');
        expect(worker.postMessage).toHaveBeenCalledTimes(1);
        await waitFor(() => {
            expect(appLine()).toHaveTextContent('Updating the app.');
        });
        // The page reloads once the waiting worker has taken over, and only once.
        expect(reload).not.toHaveBeenCalled();
        workers.handOver();
        workers.handOver();
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('offers nothing on a first install, which has no older version to replace', () => {
        const { workers } = watched(new StandInWorker('installed'), null);
        render(frameAt('play'));
        expect(shownNow()).toBe('');
        // The first worker taking charge of the page is no update from another tab either.
        act(() => {
            workers.handOver();
        });
        expect(shownNow()).toBe('');
        expect(reload).not.toHaveBeenCalled();
    });

    it("waits while a round is entered, and offers once the visitor leaves the round's screen", async () => {
        watched();
        const { rerender } = render(frameAt('game', '?id=g-1'));
        expect(shownNow()).toBe('');
        rerender(frameAt('game', '?id=g-1&round=2'));
        expect(shownNow()).toBe('');
        rerender(frameAt('scores', '?id=g-1'));
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
    });

    it("takes the offer away on the round's screen, and makes it again once the visitor leaves", async () => {
        const { registration } = watched(null);
        const { rerender } = render(frameAt('recap', '?id=g-1'));
        rerender(frameAt('game', '?id=g-2'));
        const worker = new StandInWorker('installing');
        act(() => {
            registration.found(worker);
            worker.become('installed');
        });
        expect(shownNow()).toBe('');
        rerender(frameAt('play'));
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
        rerender(frameAt('game', '?id=g-2'));
        expect(shownNow()).toBe('');
        expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
        rerender(frameAt('scores', '?id=g-2'));
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
    });

    it("holds an offer the visitor closed until the page is shown again or a round's screen is left", async () => {
        watched();
        const { rerender } = render(frameAt('play'));
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
        press('Close');
        expect(shownNow()).toBe('');
        rerender(frameAt('history'));
        rerender(frameAt('players'));
        expect(shownNow()).toBe('');
        setShown(false);
        setShown(true);
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
        expect(reload).not.toHaveBeenCalled();
        // Closed again, it is held until the visitor next leaves a round's screen.
        press('Close');
        rerender(frameAt('history'));
        expect(shownNow()).toBe('');
        rerender(frameAt('game', '?id=g-1'));
        rerender(frameAt('scores', '?id=g-1'));
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
    });

    it('keeps one offer shown as the visitor moves between screens that allow it', async () => {
        watched();
        const { rerender } = render(frameAt('play'));
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
        const said = toastLine().textContent;
        rerender(frameAt('players'));
        expect(toastLine().textContent).toBe(said);
        expect(screen.getAllByRole('button', { name: 'Update' })).toHaveLength(1);
    });

    it('makes the offer again once a message that took its place goes', async () => {
        watched();
        render(frameAt('players', '', <Saver words="Ann is added." />));
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
        press('Save');
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent('Ann is added.');
        });
        press('Close');
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
    });

    it('never replaces a toast that carries Undo, and offers once that one goes', async () => {
        const undo = { label: 'Undo', onAction: () => undefined };
        const { rerender } = render(
            frameAt('game', '?id=g-1', <Saver words="Round 3 saved." action={undo} />)
        );
        press('Save');
        const worker = new StandInWorker('installing');
        const { registration } = watched(null);
        act(() => {
            registration.found(worker);
            worker.become('installed');
        });
        rerender(frameAt('scores', '?id=g-1'));
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent('Round 3 saved. Undo is available.');
        });
        expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
        press('Close');
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
    });

    it('makes the offer again for a newer worker once the one agreed to was replaced', async () => {
        const first = new StandInWorker('installed');
        const { registration, workers } = watched(first);
        render(frameAt('play'));
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
        press('Update');
        const second = new StandInWorker('installing');
        act(() => {
            first.become('redundant');
            registration.found(second);
            second.become('installed');
        });
        setShown(false);
        setShown(true);
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
        press('Update');
        expect(second.postMessage).toHaveBeenCalledTimes(1);
        workers.handOver();
        expect(reload).toHaveBeenCalledTimes(1);
    });
});

describe('a page a newer database refuses', () => {
    /** Makes the page's database newer than this build, and has the page try to open it. */
    const refuse = async () => {
        const factory = new IDBFactory();
        await upgradeIn(factory);
        await act(async () => {
            await expect(openStore(factory)).rejects.toThrow(NEWER_DATABASE);
        });
    };

    it("offers the update on any screen, the round's too", async () => {
        const { registration } = watched();
        render(frameAt('game', '?id=g-1'));
        expect(shownNow()).toBe('');
        await refuse();
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
        // The browser is asked for the newer build, in case it has not found it yet.
        expect(registration.update).toHaveBeenCalled();
    });

    it('offers a reload where no newer worker is waiting', async () => {
        watched(null);
        render(frameAt('game', '?id=g-1'));
        await refuse();
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(RELOAD_ONLY);
        });
        press('Reload');
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('offers a reload where no worker is in charge of the page', async () => {
        watched(new StandInWorker('installed'), null);
        render(frameAt('play'));
        await refuse();
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(RELOAD_ONLY);
        });
        press('Reload');
        expect(reload).toHaveBeenCalledTimes(1);
    });
});

describe('a page another tab updated', () => {
    it('says so with a Reload, and reloads only once the page is hidden', async () => {
        const { workers } = watched(null);
        render(frameAt('scores', '?id=g-1'));
        act(() => {
            workers.handOver();
        });
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(NOTICE);
        });
        expect(reload).not.toHaveBeenCalled();
        setShown(false);
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it("waits for the visitor to leave the round's screen, while its store is still open", async () => {
        const { workers } = watched(null);
        const { rerender } = render(frameAt('game', '?id=g-1'));
        act(() => {
            workers.handOver();
        });
        expect(shownNow()).toBe('');
        rerender(frameAt('scores', '?id=g-1'));
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(NOTICE);
        });
    });

    it('says so again on the next arrival once the visitor closes it', async () => {
        const { workers } = watched(null);
        const { rerender } = render(frameAt('play'));
        act(() => {
            workers.handOver();
        });
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(NOTICE);
        });
        press('Close');
        rerender(frameAt('play'));
        expect(shownNow()).toBe('');
        rerender(frameAt('history'));
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(NOTICE);
        });
    });

    it('reloads at once where the page is hidden as it happens', () => {
        const { workers } = watched(null);
        render(frameAt('play'));
        setShown(false);
        act(() => {
            workers.handOver();
        });
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('says so on any screen once a newer build closes the store, in place of an Undo, and waits for the visitor', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        watched(null);
        const undo = { label: 'Undo', onAction: () => undefined };
        render(frameAt('game', '?id=g-1', <Saver words="Round 3 saved." action={undo} />));
        press('Save');
        const factory = new IDBFactory();
        const store = await openStore(factory);
        await act(async () => {
            await upgradeIn(factory);
        });
        expect(store.closed()).toBe(true);
        // The toast's line says a message a moment after it shows.
        act(() => {
            vi.advanceTimersByTime(150);
        });
        expect(toastLine()).toHaveTextContent(NOTICE);
        act(() => {
            vi.advanceTimersByTime(4000);
        });
        expect(reload).not.toHaveBeenCalled();
        press('Reload');
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('reloads once however often the page is hidden after the store closes', async () => {
        watched(null);
        render(frameAt('players'));
        const factory = new IDBFactory();
        await openStore(factory);
        await act(async () => {
            await upgradeIn(factory);
        });
        expect(reload).not.toHaveBeenCalled();
        setShown(false);
        setShown(true);
        setShown(false);
        expect(reload).toHaveBeenCalledTimes(1);
    });
});

describe('a page whose screen did not load', () => {
    const MISSING =
        'This screen could not load. Reload this page to keep scoring. Reload is available.';

    afterEach(() => {
        act(() => {
            screenFound();
        });
    });

    it("offers a reload at once, the round's screen too, and keeps it once the worker is found", async () => {
        // A page left by another test's replaced build starts afresh.
        watched(null);
        render(frameAt('game', '?id=g-1'));
        act(() => {
            screenMissing();
        });
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(MISSING);
        });
        act(() => {
            watched(null);
        });
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(toastLine()).toHaveTextContent(MISSING);
    });

    it('takes the reload away once a screen loads after all', async () => {
        watched(null);
        render(frameAt('history'));
        act(() => {
            screenMissing();
        });
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(MISSING);
        });
        act(() => {
            screenFound();
        });
        await waitFor(() => {
            expect(shownNow()).not.toContain('This screen could not load.');
        });
    });
});
