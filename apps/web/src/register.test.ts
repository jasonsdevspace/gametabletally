import { afterEach, describe, expect, it, vi } from 'vitest';

import { registerWorker } from './register.js';

/** A browser that can run a worker, with what the page asks of it recorded. */
const workerBrowser = () => {
    const register = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'serviceWorker', { value: { register }, configurable: true });
    // The listener is kept rather than added, so no test's load handler runs in another.
    const listen = vi.spyOn(window, 'addEventListener').mockImplementation(() => undefined);
    return { register, listen };
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

    it('registers nothing on the dev server, which has no worker to serve', () => {
        vi.stubEnv('PROD', false);
        const { register, listen } = workerBrowser();
        registerWorker();
        for (const [, onLoad] of listen.mock.calls)
            if (typeof onLoad === 'function') onLoad(new Event('load'));
        expect(register).not.toHaveBeenCalled();
    });
});
