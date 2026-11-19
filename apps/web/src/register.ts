/**
 * Registers the service worker once the page has loaded, so the whole app is cached for the next
 * visit with no connection. Only the built app has a worker. A browser that cannot run one, or
 * refuses to, as some private windows do, keeps working online.
 */
export const registerWorker = (): void => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        // The worker's file is always asked of the server, past the browser's cache and the ten
        // minutes GitHub Pages lets it keep a file, so a new deploy is found on the next visit.
        navigator.serviceWorker
            .register('/sw.js', { scope: '/', updateViaCache: 'none' })
            .catch(() => undefined);
    });
};
