import { warmScreens } from './screens.js';
import { watchUpdates } from './update.js';

/**
 * Registers the service worker once the page has loaded, so the whole app is cached for the next
 * visit with no connection, and watches it for a newer build. Only the built app has a worker. A
 * browser that cannot run one, or refuses to, as some private windows do, keeps working online.
 *
 * Every screen's code is loaded too, once the worker serves it from the phone, so a move to a
 * screen not yet opened draws at once. A browser with no worker loads it once the page has loaded
 * instead, so its screens open at once and with no connection after.
 */
export const registerWorker = (): void => {
    if (!import.meta.env.PROD) return;
    if (!('serviceWorker' in navigator)) {
        window.addEventListener('load', warmScreens);
        return;
    }
    const workers = navigator.serviceWorker;
    window.addEventListener('load', () => {
        workers
            .register('/sw.js', { scope: '/' })
            // A browser that blocks workers may answer with no registration, which has nothing to
            // watch.
            .then((found?: ServiceWorkerRegistration) => {
                if (!found) {
                    warmScreens();
                    return;
                }
                watchUpdates(found);
                if (workers.controller) warmScreens();
                else workers.addEventListener('controllerchange', warmScreens, { once: true });
            }, warmScreens);
    });
};
