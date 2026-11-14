import { describe, expect, it } from 'vitest';

import { hrefOf, routeAt, ROUTES, titleOf } from './routes.js';

describe('the addresses', () => {
    it('are exact paths that end in a slash, each once', () => {
        for (const { path } of ROUTES) expect(path).toMatch(/^\/([a-z]+\/)?$/);
        expect(new Set(ROUTES.map(({ path }) => path)).size).toBe(ROUTES.length);
    });

    it('name a game or a player by id in the query, never in the path', () => {
        expect(hrefOf('recap', 'g 1')).toBe('/recap/?id=g+1');
        expect(hrefOf('player', 'p-ann')).toBe('/player/?id=p-ann');
        expect(() => hrefOf('game')).toThrow(/by its id/);
        expect(hrefOf('history')).toBe('/history/');
    });

    it('find a route by its exact path alone', () => {
        expect(routeAt('/players/')?.name).toBe('players');
        expect(routeAt('/players')).toBeNull();
        expect(routeAt('/player/p-ann/')).toBeNull();
    });

    it("title every page but the start with its heading and the app's name", () => {
        expect(titleOf('Game Table Tally')).toBe('Game Table Tally');
        expect(titleOf('Scores')).toBe('Scores, Game Table Tally');
    });
});
