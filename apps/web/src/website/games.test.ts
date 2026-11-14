import { GAMES } from '@gametabletally/scoring';
import { describe, expect, it } from 'vitest';

import { cardOf, hasCard, listOf, playersOf } from './games.js';

describe("the website's words for each game", () => {
    it.each(GAMES.map((game) => [game.name, game.id] as const))(
        'has a line and a mark for %s',
        (_, id) => {
            expect(hasCard(id)).toBe(true);
            expect(cardOf(id).line).not.toBe('');
            expect(cardOf(id).mark).not.toBe('');
        }
    );

    it('gives a game it has no words for a plain card, so a new game still draws', () => {
        expect(cardOf('bowling')).toEqual({ line: '', mark: '' });
    });

    it('says how many play, with or without a limit', () => {
        expect(playersOf({ minPlayers: 2, maxPlayers: 8 })).toBe('2 to 8 players');
        expect(playersOf({ minPlayers: 3, maxPlayers: null })).toBe('3 or more players');
    });

    it('joins names with commas and the last by its word', () => {
        expect(listOf(['Flip 7', 'Skyjo', 'Wizard'], 'or')).toBe('Flip 7, Skyjo or Wizard');
        expect(listOf(['Flip 7', 'Skyjo'], 'and')).toBe('Flip 7 and Skyjo');
        expect(listOf(['Flip 7'], 'and')).toBe('Flip 7');
        expect(listOf([], 'and')).toBe('');
    });
});
