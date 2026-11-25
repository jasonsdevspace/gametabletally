import { describe, expect, it, vi } from 'vitest';

import { forgetFailedLoads, loader, NotLoaded } from './loader.js';

/** Lets every promise settled so far run its handlers. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A load that fails the first time and arrives after, counting how often it is asked for. */
const failingOnce = () => {
    let asks = 0;
    const load = vi.fn(() => {
        asks += 1;
        return asks === 1
            ? Promise.reject(new TypeError('Failed to fetch a module'))
            : Promise.resolve('module');
    });
    return load;
};

describe('a module loaded on demand', () => {
    it('is loaded once, and read at once by React once it has arrived', async () => {
        const load = vi.fn(() => Promise.resolve('module'));
        const { load: ask } = loader(load);
        const first = ask();
        expect(ask()).toBe(first);
        await first;
        expect(first).toMatchObject({ status: 'fulfilled', value: 'module' });
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('fails as a module that did not arrive, and keeps the failure until the screen has said so', async () => {
        const load = failingOnce();
        const { load: ask } = loader(load);
        const failed = ask();
        await expect(failed).rejects.toBeInstanceOf(NotLoaded);
        expect(failed).toMatchObject({ status: 'rejected' });
        // React asks again as it draws the failure, and is given the same failure.
        expect(ask()).toBe(failed);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('loads afresh on the next ask once the failure has been said', async () => {
        const load = failingOnce();
        const { load: ask } = loader(load);
        await expect(ask()).rejects.toBeInstanceOf(NotLoaded);
        forgetFailedLoads();
        await expect(ask()).resolves.toBe('module');
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('forgets a failed fetch ahead at once where no screen has asked for it', async () => {
        const load = failingOnce();
        const { load: ask, prefetch } = loader(load);
        prefetch();
        await settle();
        await expect(ask()).resolves.toBe('module');
        expect(load).toHaveBeenCalledTimes(2);
    });

    it('keeps a failed fetch ahead that a screen is waiting on, until the screen has said so', async () => {
        const load = failingOnce();
        const { load: ask, prefetch } = loader(load);
        prefetch();
        const waiting = ask();
        await expect(waiting).rejects.toBeInstanceOf(NotLoaded);
        expect(ask()).toBe(waiting);
        expect(load).toHaveBeenCalledTimes(1);
    });

    it('keeps a module that arrived when failed loads are forgotten', async () => {
        const load = vi.fn(() => Promise.resolve('module'));
        const { load: ask } = loader(load);
        const arrived = ask();
        await arrived;
        forgetFailedLoads();
        expect(ask()).toBe(arrived);
        expect(load).toHaveBeenCalledTimes(1);
    });
});
