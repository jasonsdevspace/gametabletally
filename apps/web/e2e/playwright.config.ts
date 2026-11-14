import { defineConfig, devices } from '@playwright/test';

/**
 * The app in a real browser, served from the built files as GitHub Pages serves them.
 *
 * `npm run e2e` at the root builds first, so what runs here is the production build, with the
 * not-found page and its 404 status as they are deployed. On a desktop and a phone profile.
 *
 * The rules every test here keeps, so the suite stays quick and steady as it grows: no fixed
 * waits, reduced motion on unless a test is of motion, fonts ready before anything is measured,
 * a test that passes only on a retry fails the run, and a seeded game carries fixed dates.
 */
export default defineConfig({
    testDir: '.',
    fullyParallel: true,
    forbidOnly: Boolean(process.env['CI']),
    retries: process.env['CI'] ? 1 : 0,
    // A test that passes only when run again is flaky, and fails the run by name rather than
    // hiding behind the retry.
    failOnFlakyTests: Boolean(process.env['CI']),
    reporter: process.env['CI'] ? [['list'], ['html', { open: 'never' }]] : 'list',
    use: {
        baseURL: 'http://localhost:4180/',
        trace: 'retain-on-failure',
        contextOptions: { reducedMotion: 'reduce' },
        // No test runs against a page a service worker cached, but the worker's own, which
        // allows it for itself.
        serviceWorkers: 'block',
    },
    projects: [
        { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
        { name: 'phone', use: { ...devices['Pixel 7'] } },
    ],
    webServer: {
        command: 'node scripts/serve.mjs 4180',
        cwd: '..',
        url: 'http://localhost:4180/',
        reuseExistingServer: !process.env['CI'],
        timeout: 30_000,
    },
});
