import { describe, expect, it } from 'vitest';

import type { SavedPlayer } from '../store/format.js';
import { cleanName, moveSeat, playerNamed, seatsProblem } from './seats.js';

const player = (id: string, name: string, removed = false): SavedPlayer => ({
    id,
    name,
    added: '2026-11-01T10:00:00Z',
    removed,
});

describe('moving a seat', () => {
    it('moves a player a place toward the first seat or the last', () => {
        expect(moveSeat(['ann', 'ben', 'cat'], 'cat', -1)).toEqual(['ann', 'cat', 'ben']);
        expect(moveSeat(['ann', 'ben', 'cat'], 'ann', 1)).toEqual(['ben', 'ann', 'cat']);
    });

    it('leaves the seats as they are past either end, or for a player not seated', () => {
        const seats = ['ann', 'ben'];
        expect(moveSeat(seats, 'ann', -1)).toBe(seats);
        expect(moveSeat(seats, 'ben', 1)).toBe(seats);
        expect(moveSeat(seats, 'cat', 1)).toBe(seats);
    });
});

describe('a typed name', () => {
    it('is trimmed, with each run of spaces inside it made one', () => {
        expect(cleanName('  Mary   Ann ')).toBe('Mary Ann');
        expect(cleanName('   ')).toBe('');
    });

    it('finds the saved player it belongs to whatever its case, one still offered first', () => {
        const players = [player('old', 'Ann', true), player('ann', 'Ann'), player('ben', 'Ben')];
        expect(playerNamed(players, 'ann')?.id).toBe('ann');
        expect(playerNamed(players, 'BEN')?.id).toBe('ben');
        expect(playerNamed(players, 'Cat')).toBeUndefined();
    });

    it('finds a removed player when no one else has the name', () => {
        expect(playerNamed([player('old', 'Ann', true)], 'Ann')?.id).toBe('old');
    });
});

describe('what the screen says about the seats', () => {
    const flip7 = { name: 'Flip 7', minPlayers: 3, maxPlayers: null };
    const skyjo = { name: 'Skyjo', minPlayers: 2, maxPlayers: 8 };

    it('asks for a game before any is chosen', () => {
        expect(seatsProblem(undefined, 3)).toBe('Choose a game, then add its players.');
    });

    it('says how many the game takes and how many more to add', () => {
        expect(seatsProblem(flip7, 1)).toBe('Flip 7 takes 3 players or more. Add 2 more.');
        expect(seatsProblem(skyjo, 0)).toBe('Skyjo takes 2 players or more. Add 2 more.');
    });

    it('says how many the game takes and how many to remove', () => {
        expect(seatsProblem(skyjo, 9)).toBe('Skyjo takes 8 players or fewer. Remove 1.');
    });

    it('says nothing once the game takes the players seated', () => {
        expect(seatsProblem(skyjo, 2)).toBeNull();
        expect(seatsProblem(flip7, 12)).toBeNull();
    });
});
