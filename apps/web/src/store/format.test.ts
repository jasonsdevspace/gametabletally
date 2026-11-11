import { score } from '@gametabletally/scoring';
import { describe, expect, it } from 'vitest';

import {
    compareInstants,
    FORMAT,
    FORMAT_VERSION,
    readFile,
    readGame,
    readPlayer,
    type SavedFile,
    type SavedGame,
    type SavedPlayer,
    toScoreInput,
} from './format.js';

const ann: SavedPlayer = {
    id: 'p-ann',
    name: 'Ann',
    added: '2026-11-01T10:00:00Z',
    removed: false,
};

const game: SavedGame = {
    id: 'g-1',
    game: 'flip-7',
    rules: 1,
    options: {},
    players: ['p-ann', 'p-ben', 'p-cat'],
    rounds: [
        {
            entries: {
                'p-ann': { numbers: [3, 5, 9], modifiers: ['x2', '+4'], bust: false },
                'p-ben': { numbers: [12], modifiers: [], bust: false },
                'p-cat': { numbers: [7, 7], modifiers: [], bust: true },
            },
        },
    ],
    started: '2026-11-01T10:05:00Z',
    changed: '2026-11-01T10:20:00Z',
};

const file: SavedFile = {
    format: FORMAT,
    version: FORMAT_VERSION,
    exported: '2026-11-02T09:00:00Z',
    players: [ann],
    games: [game],
};

describe('the saved shape', () => {
    it('reads back a player and a game as they were saved', () => {
        expect(readPlayer(JSON.parse(JSON.stringify(ann)))).toEqual(ann);
        expect(readGame(JSON.parse(JSON.stringify(game)))).toEqual(game);
    });

    it.each([
        ['nothing', null],
        ['text', 'Ann'],
        ['a player with no id', { ...ann, id: '' }],
        ['a player with no name', { ...ann, name: undefined }],
        ['a player who does not say whether they were removed', { ...ann, removed: undefined }],
        ['a player added at a time with an offset', { ...ann, added: '2026-11-01T12:00:00+02:00' }],
        ['a player added on a date with no time', { ...ann, added: '2026-11-01' }],
    ])('does not read %s as a player', (_, raw) => {
        expect(readPlayer(raw)).toBeNull();
    });

    it.each([
        ['nothing', null],
        ['a game with no id', { ...game, id: undefined }],
        ['a game that does not name its game', { ...game, game: '' }],
        ['a game whose rule set is not a whole number', { ...game, rules: 1.5 }],
        ['a game whose rule set is before the first', { ...game, rules: 0 }],
        ['a game changed at a time that is not one', { ...game, changed: 'yesterday' }],
        ['a game with no options', { ...game, options: null }],
        ['a game with a player named by a number', { ...game, players: ['p-ann', 2] }],
        ['a game with no rounds', { ...game, rounds: undefined }],
        ['a game that does not say when it was changed', { ...game, changed: undefined }],
    ])('does not read %s as a game', (_, raw) => {
        expect(readGame(raw)).toBeNull();
    });

    it('holds no total, so a game is scored from what was entered every time', () => {
        expect(Object.keys(game).sort()).toEqual(
            ['changed', 'game', 'id', 'options', 'players', 'rounds', 'rules', 'started'].sort()
        );
    });

    it('hands a game to the scoring package under the rule set it names', () => {
        const result = score(toScoreInput(game));
        expect(result.problems).toEqual([]);
        expect(result.rules).toBe(game.rules);
        expect(result.totals).toEqual({ 'p-ann': 38, 'p-ben': 12, 'p-cat': 0 });
    });
});

describe('dates and times', () => {
    it('reads a time written to the second and one written to the millisecond', () => {
        expect(readGame({ ...game, changed: '2026-11-01T10:20:00Z' })).not.toBeNull();
        expect(readGame({ ...game, changed: '2026-11-01T10:20:00.500Z' })).not.toBeNull();
    });

    it('orders two times as moments, however finely each is written', () => {
        // As text the second sorts first, since a full stop comes before a Z.
        expect(compareInstants('2026-11-01T10:20:00.500Z', '2026-11-01T10:20:00Z')).toBeGreaterThan(
            0
        );
        expect(compareInstants('2026-11-01T10:20:00Z', '2026-11-01T10:20:00.000Z')).toBe(0);
        expect(compareInstants('2026-11-01T10:19:59Z', '2026-11-01T10:20:00Z')).toBeLessThan(0);
    });
});

describe('reading an exported file', () => {
    it('reads a file this build wrote', () => {
        expect(readFile(JSON.stringify(file))).toEqual(file);
    });

    it('refuses a file from a newer version whole, in a sentence a person can act on', () => {
        const newer = JSON.stringify({ ...file, version: FORMAT_VERSION + 1, shelves: [] });
        const answer = readFile(newer);
        expect(answer).toMatchObject({ code: 'newer-format' });
        expect('message' in answer ? answer.message : '').toMatch(/newer version of the app/);
    });

    it.each([
        ['text that is not JSON', '{"format":'],
        ['JSON that is not an object', '[]'],
        ['another kind of file', JSON.stringify({ ...file, format: 'something-else' })],
        ['a file with no version', JSON.stringify({ ...file, version: undefined })],
        ['a file with a version before the first', JSON.stringify({ ...file, version: 0 })],
        ['a file that does not say when it was written', JSON.stringify({ ...file, exported: '' })],
        ['a file with a player that is not one', JSON.stringify({ ...file, players: [{ id: 1 }] })],
        ['a file with a game that is not one', JSON.stringify({ ...file, games: [{ id: 'g' }] })],
        ['a file with no list of games', JSON.stringify({ ...file, games: undefined })],
        ['a file that holds a game twice', JSON.stringify({ ...file, games: [game, game] })],
        ['a file that holds a player twice', JSON.stringify({ ...file, players: [ann, ann] })],
    ])('says %s is not a file of saved games', (_, text) => {
        expect(readFile(text)).toMatchObject({ code: 'not-a-file' });
    });
});
