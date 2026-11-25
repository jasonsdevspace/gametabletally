import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FORMAT_VERSION } from '../store/format.js';
import { NEWER_DATABASE, openStore } from '../store/store.js';
import { page, watchUpdates } from '../update.js';
import { AppFrame, useToast } from './AppFrame.js';
import { act, render, screen, waitFor } from './render.testing.js';

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
}

const OFFER = 'A new version of the app is ready.';
const OFFERED = `${OFFER} Update is available.`;

/** The toast's own status line, where a shown message is said. */
const toastLine = (): HTMLElement => {
    const line = document.querySelector<HTMLElement>('.dk-app-toast [role="status"]');
    if (!line) throw new Error('The toast is not on the page.');
    return line;
};

/** A registration and its page's workers, watched as the app watches its own. */
const watched = (waiting: StandInWorker | null = new StandInWorker('installed')) => {
    const registration = new StandInRegistration();
    const workers = new StandInWorkers();
    registration.waiting = waiting;
    watchUpdates(registration, workers);
    return { registration, workers };
};

const frameAt = (screenName: string, search = '') => (
    <AppFrame screen={screenName} search={search} title={screenName} />
);

let reload: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    reload = vi.spyOn(page, 'reload').mockImplementation(() => undefined);
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
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
        act(() => {
            screen.getByRole('button', { name: 'Update' }).click();
        });
        expect(worker.postMessage).toHaveBeenCalledTimes(1);
        // The page reloads once the waiting worker has taken over, and only once.
        expect(reload).not.toHaveBeenCalled();
        workers.dispatchEvent(new Event('controllerchange'));
        workers.dispatchEvent(new Event('controllerchange'));
        expect(reload).toHaveBeenCalledTimes(1);
    });

    it('offers nothing on a first install, which has no older version to replace', () => {
        const worker = new StandInWorker('installed');
        const registration = new StandInRegistration();
        const workers = new StandInWorkers();
        workers.controller = null;
        registration.waiting = worker;
        watchUpdates(registration, workers);
        render(frameAt('play'));
        expect(toastLine()).toHaveTextContent('');
    });

    it("waits while a round is entered, and offers once the visitor leaves the round's screen", async () => {
        watched();
        const { rerender } = render(frameAt('game', '?id=g-1'));
        expect(toastLine()).toHaveTextContent('');
        rerender(frameAt('game', '?id=g-1&round=2'));
        expect(toastLine()).toHaveTextContent('');
        rerender(frameAt('scores', '?id=g-1'));
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
    });

    it("waits for a version found while a round is entered, and takes the offer away on the round's screen", async () => {
        const { registration } = watched(null);
        const { rerender } = render(frameAt('recap', '?id=g-1'));
        rerender(frameAt('game', '?id=g-2'));
        const worker = new StandInWorker('installing');
        act(() => {
            registration.found(worker);
            worker.become('installed');
        });
        expect(toastLine()).toHaveTextContent('');
        rerender(frameAt('play'));
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
        rerender(frameAt('game', '?id=g-2'));
        expect(toastLine()).toHaveTextContent('');
        expect(screen.queryByRole('button', { name: 'Update' })).toBeNull();
    });

    it('makes an offer not taken again on the next visit to a screen that allows it', async () => {
        watched();
        const { rerender } = render(frameAt('play'));
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
        act(() => {
            screen.getByRole('button', { name: 'Close' }).click();
        });
        expect(toastLine()).toHaveTextContent('');
        rerender(frameAt('play'));
        expect(toastLine()).toHaveTextContent('');
        rerender(frameAt('history'));
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

    it('never replaces a toast that carries Undo, and offers once that one goes', async () => {
        const Saver = () => {
            const show = useToast();
            return (
                <button
                    type="button"
                    onClick={() => show('Round 3 saved.', { label: 'Undo', onAction: () => {} })}
                >
                    Save
                </button>
            );
        };
        const { rerender } = render(
            <AppFrame screen="game" title="Game in play">
                <Saver />
            </AppFrame>
        );
        act(() => {
            screen.getByRole('button', { name: 'Save' }).click();
        });
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
        act(() => {
            screen.getByRole('button', { name: 'Close' }).click();
        });
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
    });

    it("offers the update on any screen, the round's too, once a newer database refuses the page", async () => {
        const { registration } = watched();
        render(frameAt('game', '?id=g-1'));
        expect(toastLine()).toHaveTextContent('');
        const factory = new IDBFactory();
        await new Promise<void>((resolve) => {
            const opening = factory.open('gametabletally', FORMAT_VERSION + 1);
            opening.onsuccess = () => {
                opening.result.close();
                resolve();
            };
        });
        await act(async () => {
            await expect(openStore(factory)).rejects.toThrow(NEWER_DATABASE);
        });
        await waitFor(() => {
            expect(toastLine()).toHaveTextContent(OFFERED);
        });
        // The browser is asked for the newer build, in case it has not found it yet.
        expect(registration.update).toHaveBeenCalled();
    });

    it('says so and reloads when a newer build closes the store under the page', async () => {
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
        render(frameAt('game', '?id=g-1'));
        const factory = new IDBFactory();
        const store = await openStore(factory);
        await act(async () => {
            await new Promise<void>((resolve) => {
                const opening = factory.open('gametabletally', FORMAT_VERSION + 1);
                opening.onsuccess = () => {
                    opening.result.close();
                    resolve();
                };
            });
        });
        expect(store.closed()).toBe(true);
        // The toast's line says a message a moment after it shows.
        act(() => {
            vi.advanceTimersByTime(150);
        });
        expect(toastLine()).toHaveTextContent(
            'The app was updated in another tab, so this page will reload.'
        );
        expect(reload).not.toHaveBeenCalled();
        act(() => {
            vi.advanceTimersByTime(3850);
        });
        expect(reload).toHaveBeenCalledTimes(1);
    });
});
