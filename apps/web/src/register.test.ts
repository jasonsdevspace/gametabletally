import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerWorker } from './register.js';

/** A browser that can run a worker, with what the page asks of it recorded. */
const workerBrowser = () => {
    const registration = Object.assign(new EventTarget(), {
        waiting: null,
        installing: null,
        update: vi.fn(() => Promise.resolve()),
    });
    const register = vi.fn((): Promise<typeof registration | undefined> =>
        Promise.resolve(registration)
    );
    Object.defineProperty(navigator, 'serviceWorker', {
        value: Object.assign(new EventTarget(), { register, controller: {} }),
        configurable: true,
    });
    // The listener is kept rather than added, so no test's load handler runs in another.
    const listen = vi.spyOn(window, 'addEventListener').mockImplementation(() => undefined);
    return { register, listen, registration };
};

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    Reflect.deleteProperty(navigator, 'serviceWorker');
});

describe('registering the service worker', () => {
    it('registers the worker for the whole app once the built page has loaded', () => {
        vi.stubEnv('PROD', true);
        const { register, listen } = workerBrowser();
        registerWorker();
        expect(register).not.toHaveBeenCalled();
        const onLoad = listen.mock.calls.find(([type]) => type === 'load')?.[1];
        if (typeof onLoad !== 'function') throw new Error('Nothing waits for the page to load.');
        onLoad(new Event('load'));
        expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    });

    it('asks for a new version each time the page is shown again', async () => {
        vi.stubEnv('PROD', true);
        const { listen, registration } = workerBrowser();
        registerWorker();
        const onLoad = listen.mock.calls.find(([type]) => type === 'load')?.[1];
        if (typeof onLoad !== 'function') throw new Error('Nothing waits for the page to load.');
        onLoad(new Event('load'));
        await Promise.resolve();
        listen.mockRestore();
        document.dispatchEvent(new Event('visibilitychange'));
        expect(registration.update).toHaveBeenCalledTimes(1);
    });

    it('watches nothing where a browser that blocks workers answers with no registration', async () => {
        vi.stubEnv('PROD', true);
        const { register, listen } = workerBrowser();
        register.mockImplementation(() => Promise.resolve(undefined));
        registerWorker();
        const onLoad = listen.mock.calls.find(([type]) => type === 'load')?.[1];
        if (typeof onLoad !== 'function') throw new Error('Nothing waits for the page to load.');
        onLoad(new Event('load'));
        // A failure in the watch would reject unheard, which fails the run.
        await expect(register.mock.results[0]?.value).resolves.toBeUndefined();
        await new Promise((resolve) => setTimeout(resolve, 0));
    });

    it('registers nothing on the dev server, which has no worker to serve', () => {
        vi.stubEnv('PROD', false);
        const { register, listen } = workerBrowser();
        registerWorker();
        for (const [, onLoad] of listen.mock.calls)
            if (typeof onLoad === 'function') onLoad(new Event('load'));
        expect(register).not.toHaveBeenCalled();
    });
});
