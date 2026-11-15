import { describe, expect, it } from 'vitest';

import { damagedOf, fileNameOf, keptOf, restoredOf, savedOf } from './backup-words.js';

describe("the about page's words for the saved games", () => {
    it("names the file for the day on the phone's own calendar", () => {
        expect(fileNameOf(new Date(2026, 10, 4, 23, 30))).toBe('game-table-tally-2026-11-04.json');
        expect(fileNameOf(new Date(2027, 0, 1, 0, 5))).toBe('game-table-tally-2027-01-01.json');
    });

    it('says what a restore added, one or many, and when it added nothing', () => {
        expect(restoredOf({ games: 3, players: 1 })).toBe(
            'Restored 3 games and 1 player from the file.'
        );
        expect(restoredOf({ games: 1, players: 0 })).toBe(
            'Restored 1 game and 0 players from the file.'
        );
        expect(restoredOf({ games: 0, players: 0 })).toBe(
            'Nothing was added. This phone already holds everything in the file.'
        );
    });

    it('says what a save wrote', () => {
        expect(savedOf(1, 'a.json')).toBe('Saved 1 game to a.json.');
        expect(savedOf(0, 'a.json')).toBe('Saved 0 games to a.json.');
    });

    it('says whether the browser will keep the games, in words for each answer', () => {
        expect(keptOf(true)).toContain('has agreed');
        expect(keptOf(false)).toContain('has not agreed');
        expect(keptOf(null)).toContain('does not say');
    });

    it('says what a backup leaves out, and nothing when it leaves nothing out', () => {
        expect(damagedOf(0)).toBe('');
        expect(damagedOf(1)).toBe(
            'One saved record cannot be read, so a file saved now will not hold it.'
        );
        expect(damagedOf(2)).toBe(
            '2 saved records cannot be read, so a file saved now will not hold them.'
        );
    });
});
