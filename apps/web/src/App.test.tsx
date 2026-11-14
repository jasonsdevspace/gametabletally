import { GAMES } from '@gametabletally/scoring';
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';
import { navigate } from './navigation.js';
import { hrefOf, ROUTES } from './routes.js';
import { NOT_AFFILIATED } from './website/Website.js';

afterEach(() => {
    window.history.pushState(null, '', '/');
});

describe('the app', () => {
    it('names every game the scoring package knows on the start, each on its tile, in its order', () => {
        render(<App />);
        const games = within(screen.getByRole('list', { name: 'The games it scores' }));
        expect(
            games.getAllByRole('listitem').map((tile) => tile.querySelector('h3')?.textContent)
        ).toEqual(GAMES.map((game) => game.name));
    });

    it.each(ROUTES.map((route) => [route.path, route.title] as const))(
        'draws %s with one top heading, its own',
        (path, title) => {
            window.history.pushState(null, '', path);
            render(<App />);
            expect(screen.getAllByRole('heading', { level: 1 }).map((h) => h.textContent)).toEqual([
                title,
            ]);
        }
    );

    it('draws the not-found page for an address that is not one, with a way to the start', () => {
        window.history.pushState(null, '', '/no-such-page/');
        render(<App />);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
            'Nothing at this address'
        );
        expect(screen.getByRole('link', { name: 'Back to the start' })).toHaveAttribute(
            'href',
            '/'
        );
    });

    it('moves to another screen with no reload, sets its title and focus, and Back returns', async () => {
        window.history.pushState(null, '', '/no-such-page/');
        render(<App />);
        act(() => {
            screen.getByRole('link', { name: 'Back to the start' }).click();
        });
        expect(window.location.pathname).toBe('/');
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ROUTES[0].title);
        expect(document.title).toBe('Game Table Tally');
        act(() => {
            navigate(hrefOf('about'));
        });
        expect(document.activeElement?.id).toBe('main');
        expect(document.title).toBe('About, Game Table Tally');
        await act(async () => {
            window.history.back();
            await new Promise((done) => {
                window.addEventListener('popstate', done, { once: true });
            });
        });
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(ROUTES[0].title);
    });

    it('shows the error page in place of a screen that throws, with a way to the start', async () => {
        const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        vi.resetModules();
        vi.doMock('./screens.js', async (real) => {
            const screens = await real<typeof import('./screens.js')>();
            return {
                ...screens,
                Screen: () => {
                    throw new Error('A screen failed.');
                },
            };
        });
        const { App: Failing } = await import('./App.js');
        render(<Failing />);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Something went wrong');
        expect(document.title).toBe('Something went wrong, Game Table Tally');
        expect(screen.getByRole('banner')).toBeInTheDocument();
        expect(screen.getByRole('contentinfo')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Back to the start' })).toHaveAttribute(
            'href',
            '/'
        );
        vi.doUnmock('./screens.js');
        quiet.mockRestore();
    });
});

describe("the website's pages", () => {
    const at = (path: string) => {
        window.history.pushState(null, '', path);
        render(<App />);
    };

    it.each([
        ['/', null],
        ['/install/', 'Install'],
        ['/about/', 'About'],
    ] as const)(
        'draws %s in the header with all three links, the current one marked',
        (path, current) => {
            at(path);
            const nav = within(
                within(screen.getByRole('banner')).getByRole('navigation', { name: 'Website' })
            );
            const links = nav.getAllByRole('link');
            expect(links.map((link) => link.textContent)).toEqual([
                'Install',
                'About',
                'Open the app',
            ]);
            expect(
                links
                    .filter((link) => link.getAttribute('aria-current') === 'page')
                    .map((link) => link.textContent)
            ).toEqual(current === null ? [] : [current]);
        }
    );

    it.each(['/', '/about/'])('carries the not affiliated line on %s', (path) => {
        at(path);
        expect(document.body.textContent).toContain(NOT_AFFILIATED);
        expect(NOT_AFFILIATED).toBe(
            'Game Table Tally is not affiliated with the publishers of Flip 7, Skyjo or Wizard.'
        );
    });

    it('points the first visit to opening the app and to installing it', () => {
        at('/');
        const main = within(screen.getByRole('main'));
        expect(main.getAllByRole('link', { name: 'Open the app' })[0]).toHaveAttribute(
            'href',
            hrefOf('play')
        );
        expect(main.getByRole('link', { name: 'Install the app' })).toHaveAttribute(
            'href',
            hrefOf('install')
        );
    });

    it('gives the steps for an iPhone and for an Android phone, and no button until the browser offers', () => {
        at('/install/');
        for (const name of ['On an iPhone or iPad', 'On an Android phone']) {
            const section = screen.getByRole('region', { name });
            expect(within(section).getAllByRole('listitem').length).toBeGreaterThan(1);
        }
        expect(screen.queryByRole('button', { name: 'Install the app' })).toBeNull();
        expect(
            within(screen.getByRole('main')).getByRole('link', { name: 'Open the app' })
        ).toHaveAttribute('href', hrefOf('play'));
    });

    it("offers the browser's own prompt on the install page once the browser makes one", () => {
        at('/install/');
        const event = new Event('beforeinstallprompt', { cancelable: true });
        Object.assign(event, {
            prompt: () => Promise.resolve(),
            userChoice: Promise.resolve({ outcome: 'dismissed' }),
        });
        act(() => {
            window.dispatchEvent(event);
        });
        expect(screen.getByRole('button', { name: 'Install the app' })).toBeVisible();
    });

    it('holds the theme switch on the about page, shown once the page runs', () => {
        at('/about/');
        const group = screen.getByRole('radiogroup', { name: 'Theme' });
        expect(
            within(group)
                .getAllByRole('radio')
                .map((radio) => radio.getAttribute('value'))
        ).toEqual(['system', 'light', 'dark']);
        expect(group.closest('[hidden]')).toBeNull();
    });

    it('draws the not-found page in the website header and footer', () => {
        at('/no-such-page/');
        expect(screen.getByRole('banner')).toBeInTheDocument();
        expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    });
});
