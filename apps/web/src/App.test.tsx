import { GAMES } from '@gametabletally/scoring';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App.js';

describe('the start page', () => {
    it('lists every game the scoring package knows, by name and in its order', () => {
        render(<App />);
        const games = within(screen.getByRole('list', { name: 'Games' })).getAllByRole('listitem');
        expect(games.map((game) => game.textContent)).toEqual(GAMES.map((game) => game.name));
    });
});
