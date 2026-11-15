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
        expect(restoredOf({ games: 1, players: 0 })).toBe('Restored 1 game from the file.');
        expect(restoredOf({ games: 0, players: 2 })).toBe('Restored 2 players from the file.');
        expect(restoredOf({ games: 0, players: 0 })).toBe(
            'Nothing was added. Every game and player in the file is already on this phone.'
        );
    });

    it('says the file is ready and how many games it holds, since a page cannot tell it was kept', () => {
        expect(savedOf(1, 'a.json')).toBe(
            '1 game is ready in a.json. Your browser saves it with your downloads.'
        );
        expect(savedOf(2, 'a.json')).toBe(
            '2 games are ready in a.json. Your browser saves it with your downloads.'
        );
        expect(savedOf(0, 'a.json')).toBe(
            'a.json is ready, with no games on this phone yet. Your browser saves it with your downloads.'
        );
    });

    it('says whether the browser will keep the games, in words for each answer', () => {
        expect(keptOf(true)).toContain('has agreed');
        expect(keptOf(false)).toContain('has not agreed');
        expect(keptOf(null)).toContain('does not say');
    });

    it('says what a backup leaves out, and nothing when it leaves nothing out', () => {
        expect(damagedOf(0)).toBe('');
        expect(damagedOf(1)).toBe(
            'One saved game or player cannot be read, so a file saved now will leave it out.'
        );
        expect(damagedOf(2)).toBe(
            '2 saved games or players cannot be read, so a file saved now will leave them out.'
        );
    });
});
