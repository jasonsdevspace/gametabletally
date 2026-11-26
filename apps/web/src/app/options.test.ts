import { type Game, type GameOption, GAMES, type SwitchOption } from '@gametabletally/scoring';
import { describe, expect, it } from 'vitest';

import {
    named,
    namedFirst,
    optionsOf,
    optionWords,
    pickOption,
    playedWith,
    shownOf,
} from './options.js';

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

/** A game's switch option, which Wizard has. */
const switchOf = (game: Game): SwitchOption => {
    const option = game.options.find((one): one is SwitchOption => one.kind === 'switch');
    if (!option) throw new Error(`${game.name} has no switch.`);
    return option;
};

describe("a game's rule options", () => {
    it('are the ones the scoring package declares for each game', () => {
        for (const game of GAMES) expect(shownOf(game)).toEqual(game.options);
        expect(shownOf(gameOf('skyjo')).map(({ id, kind }) => [id, kind])).toEqual([
            ['target-score', 'number'],
        ]);
        expect(shownOf(gameOf('wizard')).map(({ id, kind }) => [id, kind])).toEqual([
            ['plus-minus-one', 'switch'],
            ['canadian', 'switch'],
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
        expect(optionsOf(gameOf('wizard'), {})).toEqual({
            'plus-minus-one': false,
            canadian: false,
        });
        expect(optionsOf(withNewKind, {})).toEqual({ 'target-score': 100, deal: 12 });
    });

    it('turn off a switch that cannot be on with one turned on, and say which', () => {
        const wizard = gameOf('wizard');
        const minus = pickOption(wizard, {}, 'plus-minus-one', true);
        expect(minus).toEqual({ picked: { 'plus-minus-one': true }, off: [] });
        const canadian = pickOption(wizard, minus.picked, 'canadian', true);
        expect(canadian.picked).toEqual({ 'plus-minus-one': false, canadian: true });
        expect(canadian.off.map(({ id }) => id)).toEqual(['plus-minus-one']);
        // Turning a switch off turns nothing else off.
        expect(pickOption(wizard, canadian.picked, 'canadian', false)).toEqual({
            picked: { 'plus-minus-one': false, canadian: false },
            off: [],
        });
    });

    it('name the Canadian rule as a rule named for a place, in a sentence and at its start', () => {
        const [minus, canadian] = shownOf(gameOf('wizard'));
        if (!minus || !canadian) throw new Error('Wizard has no two switches.');
        expect(named(canadian)).toBe('the Canadian rule');
        expect(namedFirst(canadian)).toBe('The Canadian rule');
        expect(named(minus)).toBe('plus or minus one');
        expect(namedFirst(minus)).toBe('Plus or minus one');
        expect(optionWords(gameOf('wizard'), { canadian: true })).toBe(
            'Played with the Canadian rule.'
        );
    });

    it('are named only where they differ from the published rules', () => {
        const named = (game: string, options: Readonly<Record<string, unknown>>) =>
            playedWith({ game, rules: 1, options });
        expect(named('skyjo', { 'target-score': 50 })).toBe('Played with a target score of 50.');
        expect(named('wizard', { 'plus-minus-one': true })).toBe('Played with plus or minus one.');
        expect(named('skyjo', { 'target-score': 100 })).toBe('');
        expect(named('wizard', { 'plus-minus-one': false })).toBe('');
        expect(named('flip-7', {})).toBe('');
        expect(named('flip-7', { 'target-score': null })).toBe('');
    });

    it('name a switch the published rules have on as played without it', () => {
        const switchedOn: Game = {
            ...gameOf('wizard'),
            options: [{ ...switchOf(gameOf('wizard')), default: true }],
        };
        expect(optionWords(switchedOn, { 'plus-minus-one': false })).toBe(
            'Played without plus or minus one.'
        );
        expect(
            optionWords(
                { ...switchedOn, options: [...switchedOn.options, ...gameOf('skyjo').options] },
                { 'plus-minus-one': false, 'target-score': 50 }
            )
        ).toBe('Played with a target score of 50 and without plus or minus one.');
    });

    it('name nothing for a game saved under a version of its rules this build does not know', () => {
        expect(playedWith({ game: 'skyjo', rules: 2, options: { 'target-score': 50 } })).toBe('');
    });
});
