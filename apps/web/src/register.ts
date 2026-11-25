import { watchUpdates } from './update.js';

/**
 * Registers the service worker once the page has loaded, so the whole app is cached for the next
 * visit with no connection, and watches it for a newer build. Only the built app has a worker. A
 * browser that cannot run one, or refuses to, as some private windows do, keeps working online.
 */
export const registerWorker = (): void => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker
            .register('/sw.js', { scope: '/' })
            // A browser that blocks workers may answer with no registration, which has nothing to
            // watch.
            .then(
                (found?: ServiceWorkerRegistration) => {
                    if (found) watchUpdates(found);
                },
                () => undefined
            );
    });
};
