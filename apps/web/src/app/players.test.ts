import { describe, expect, it } from 'vitest';

import type { SavedGame, SavedPlayer } from '../store/format.js';
import { gamesOf, nameRefusal, newPlayerOf, playedOf } from './players.js';

const player = (id: string, name: string, removed = false): SavedPlayer => ({
    id,
    name,
    added: '2026-11-01T10:00:00Z',
    removed,
});

const game = (id: string, players: readonly string[]): SavedGame => ({
    id,
    game: 'skyjo',
    rules: 1,
    options: {},
    players,
    rounds: [],
    draft: null,
    started: '2026-11-01T10:00:00Z',
    changed: '2026-11-01T10:00:00Z',
});

describe('the players', () => {
    it('counts the games each has played', () => {
        const played = playedOf([game('a', ['ann', 'ben']), game('b', ['ann'])]);
        expect(played.get('ann')).toBe(2);
        expect(played.get('ben')).toBe(1);
        expect(played.get('cat')).toBeUndefined();
    });

    it('says how many games in words', () => {
        expect(gamesOf(0)).toBe('No games yet');
        expect(gamesOf(1)).toBe('1 game');
        expect(gamesOf(12)).toBe('12 games');
    });
});

describe('a name the app refuses', () => {
    const players = [player('ann', 'Ann'), player('old', 'Dot', true)];

    it('refuses an empty name', () => {
        expect(nameRefusal(players, '')).toBe("Enter the player's name.");
    });

    it("refuses another player's name, whatever its case", () => {
        expect(nameRefusal(players, 'ann')).toBe('A player is already named Ann.');
    });

    it('takes a removed player’s name, and a player’s own name in a new case', () => {
        expect(nameRefusal(players, 'Dot')).toBeNull();
        expect(nameRefusal(players, 'ANN', 'ann')).toBeNull();
        expect(nameRefusal(players, 'Cat')).toBeNull();
    });
});

describe('a new name', () => {
    const added = new Date('2026-11-15T09:00:00Z');

    it('makes a new player', () => {
        expect(newPlayerOf([], 'Cat', 'cat', added)).toEqual({
            id: 'cat',
            name: 'Cat',
            added: '2026-11-15T09:00:00.000Z',
            removed: false,
        });
    });

    it('brings back a removed player of that name', () => {
        expect(newPlayerOf([player('old', 'Dot', true)], 'dot', 'new', added)).toEqual(
            player('old', 'Dot')
        );
    });
});
