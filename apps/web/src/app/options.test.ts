import { type Game, type GameOption, GAMES } from '@gametabletally/scoring';
import { describe, expect, it } from 'vitest';

import { optionsOf, playedWith, shownOf } from './options.js';

/* A game's rule options as the app offers them, saves them and names them. */

const gameOf = (id: string): Game => {
    const game = GAMES.find((one) => one.id === id);
    if (!game) throw new Error(`There is no game ${id}.`);
    return game;
};

/** Whether a value read from text is an object, taken as an option for the test. */
const isOption = (value: unknown): value is GameOption =>
    typeof value === 'object' && value !== null;

/** An option of a kind this build does not know, as a newer package could add, read as text. */
const newKind: unknown = JSON.parse(
    '{"id":"deal","kind":"range","name":"Deal","description":"How many cards each player is dealt.","default":12}'
);
if (!isOption(newKind)) throw new Error('The option was not read.');

/** Skyjo with the option of a kind this build does not know. */
const withNewKind: Game = { ...gameOf('skyjo'), options: [...gameOf('skyjo').options, newKind] };

describe("a game's rule options", () => {
    it('are the ones the scoring package declares for each game', () => {
        for (const game of GAMES) expect(shownOf(game)).toEqual(game.options);
        expect(shownOf(gameOf('skyjo')).map(({ id, kind }) => [id, kind])).toEqual([
            ['target-score', 'number'],
        ]);
        expect(shownOf(gameOf('wizard')).map(({ id, kind }) => [id, kind])).toEqual([
            ['plus-minus-one', 'switch'],
        ]);
    });

    it('hide an option of a kind the app does not know', () => {
        expect(shownOf(withNewKind).map(({ id }) => id)).toEqual(['target-score']);
    });

    it('are saved every one with its value, the published rule where none was changed', () => {
        expect(optionsOf(gameOf('skyjo'), {})).toEqual({ 'target-score': 100 });
        expect(optionsOf(gameOf('skyjo'), { 'target-score': 50 })).toEqual({
            'target-score': 50,
        });
        expect(optionsOf(gameOf('wizard'), {})).toEqual({ 'plus-minus-one': false });
        expect(optionsOf(withNewKind, {})).toEqual({ 'target-score': 100, deal: 12 });
    });

    it('are named only where they differ from the published rules', () => {
        expect(playedWith({ game: 'skyjo', options: { 'target-score': 50 } })).toBe(
            'Played with Target score 50.'
        );
        expect(playedWith({ game: 'wizard', options: { 'plus-minus-one': true } })).toBe(
            'Played with Plus or minus one on.'
        );
        expect(playedWith({ game: 'skyjo', options: { 'target-score': 100 } })).toBe('');
        expect(playedWith({ game: 'wizard', options: { 'plus-minus-one': false } })).toBe('');
        expect(playedWith({ game: 'flip-7', options: {} })).toBe('');
        expect(playedWith({ game: 'flip-7', options: { 'target-score': null } })).toBe('');
    });
});
