import { GAMES } from '@gametabletally/scoring';
import { act, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from './App.js';
import { navigate } from './navigation.js';
import { hrefOf, ROUTES } from './routes.js';

afterEach(() => {
    window.history.pushState(null, '', '/');
});

describe('the app', () => {
    it('lists every game the scoring package knows on the start, by name and in its order', () => {
        render(<App />);
        const games = within(screen.getByRole('list', { name: 'Games' })).getAllByRole('listitem');
        expect(games.map((game) => game.textContent)).toEqual(GAMES.map((game) => game.name));
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
        expect(screen.getByRole('link', { name: 'Back to the start' })).toHaveAttribute(
            'href',
            '/'
        );
        vi.doUnmock('./screens.js');
        quiet.mockRestore();
    });
});
