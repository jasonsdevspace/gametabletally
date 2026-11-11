import { describe, expect, it } from 'vitest';

import { GAMES } from './index.js';

describe('the games the package knows', () => {
    it('names each by an id of its own, so a saved game points at one game', () => {
        const ids = GAMES.map((game) => game.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('writes each id in lowercase words joined by hyphens, so it is safe in an address', () => {
        for (const game of GAMES) expect(game.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    });

    it('gives each a name a player can read', () => {
        for (const game of GAMES) expect(game.name.trim()).not.toBe('');
    });
});
