import type { Problem } from '@gametabletally/scoring';
import { fireEvent, render, screen, waitFor, within, appLine } from './render.testing.js';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';

import type { SavedGame, SavedPlayer } from '../store/format.js';
import { openStore } from '../store/store.js';
import { AppFrame } from './AppFrame.js';
import { GameScreen } from './GameScreen.js';
import {
    entryOf,
    heldOf,
    inputOf,
    pressed,
    skyjoLineOf,
    skyjoNote,
    skyjoRefusalWords,
} from './skyjo-round.js';
import { heard } from './status.testing.js';

/* A round of Skyjo in the app's frame, over a database in memory, and the words it draws. */

const player = (id: string, name: string): SavedPlayer => ({
    id,
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const skyjo = (
    draft: SavedGame['draft'],
    rounds: unknown[] = [],
    players = ['ann', 'ben', 'cat']
): SavedGame => ({
    id: 'g-1',
    game: 'skyjo',
    rules: 1,
    options: {},
    players,
    rounds,
    draft,
    started: '2026-11-14T10:00:00Z',
    changed: '2026-11-14T10:00:00Z',
});

const at = (
    step: NonNullable<SavedGame['draft']>['step'],
    round: Record<string, unknown> = { entries: {}, out: [] },
    index = 0
): SavedGame['draft'] => ({ index, round: { entries: {}, out: [], ...round }, step });

/** The screen at the game's address, over a database holding the game and its players. */
const draw = async (saved: SavedGame) => {
    window.history.replaceState(null, '', '/game/?id=g-1');
    const factory = new IDBFactory();
    const store = await openStore(factory);
    for (const one of [player('ann', 'Ann'), player('ben', 'Ben'), player('cat', 'Cat')])
        await store.savePlayer(one);
    await store.saveGame(saved);
    store.close();
    render(
        <AppFrame screen="game" title="Game in play">
            <GameScreen
                open={() => openStore(factory)}
                now={() => new Date('2026-11-15T09:00:00Z')}
            />
        </AppFrame>
    );
    await screen.findByRole('main');
    return { open: () => openStore(factory) };
};

const pad = () => screen.getByRole('group', { name: 'Number pad' });
const key = (name: string) => within(pad()).getByRole('button', { name });
const dockButton = (name: string | RegExp) =>
    within(screen.getByRole('region', { name: 'Actions' })).getByRole('button', { name });
const toast = () => document.querySelector('.dk-app-toast [role="status"]');
const screenLine = appLine;

/** Waits for a line to say its words, which the kit's line puts in a moment after it is told. */
const said = async (line: HTMLElement | null, words: string) => {
    if (line === null) throw new Error('The status line is not on the page.');
    await heard(line, words);
};

/** A refusal of Ann's entry in the first round, as the scoring package gives one. */
const at0 = { message: 'The package says so.', round: 0, player: 'ann' } as const;
const IMPOSSIBLE: Problem = {
    ...at0,
    code: 'impossible-total',
    data: { given: 999, min: -17, max: 142 },
};
const COPIES: Problem = { ...at0, code: 'too-many-copies', data: { card: -2, max: 5, given: 6 } };
const CARDS: Problem = { ...at0, code: 'too-many-cards', data: { max: 12, given: 13 } };
const ELSEWHERE: Problem = { ...at0, code: 'ender-out', data: {} };

describe('the words and values of a Skyjo entry', () => {
    it('types digits, a minus sign either way, deletes, and stops at three digits', () => {
        expect(pressed('', '1')).toBe('1');
        expect(pressed('1', '2')).toBe('12');
        expect(pressed('12', 'minus')).toBe('-12');
        expect(pressed('-12', 'minus')).toBe('12');
        expect(pressed('', 'minus')).toBe('-');
        expect(pressed('123', '4')).toBe('123');
        expect(pressed('-123', '4')).toBe('-123');
        expect(pressed('-12', 'delete')).toBe('-1');
        expect(pressed('0', '5')).toBe('5');
    });

    it('makes no entry of nothing, a minus sign alone or no cards, and reads one back', () => {
        expect(entryOf({ mode: 'total', typed: '', cards: [] })).toBeUndefined();
        expect(entryOf({ mode: 'total', typed: '-', cards: [] })).toBeUndefined();
        expect(entryOf({ mode: 'cards', typed: '7', cards: [] })).toBeUndefined();
        expect(entryOf({ mode: 'total', typed: '-7', cards: [3] })).toEqual({ total: -7 });
        expect(entryOf({ mode: 'cards', typed: '', cards: [12, -2] })).toEqual({ cards: [12, -2] });
        expect(inputOf({ total: -7 })).toEqual({ mode: 'total', typed: '-7', cards: [] });
        expect(inputOf({ cards: [12, -2] })).toEqual({ mode: 'cards', typed: '', cards: [12, -2] });
        expect(inputOf(null)).toEqual({ mode: 'total', typed: '', cards: [] });
        expect(heldOf({ cards: [12, -2] })).toBe(10);
        expect(heldOf({ total: 0 })).toBe(0);
        expect(heldOf(undefined)).toBeUndefined();
    });

    it("words the rules' refusals, and a code it cannot meet by the package's own sentence", () => {
        expect(skyjoRefusalWords(IMPOSSIBLE)).toBe(
            'No hand comes to 999. A total is from -17 to 142.'
        );
        expect(skyjoRefusalWords(COPIES)).toBe(
            'The deck holds 5 of the -2, so a hand holds no more. Take one out.'
        );
        expect(skyjoRefusalWords(CARDS)).toBe('A hand holds 12 cards at most. Take one out.');
        expect(skyjoRefusalWords(ELSEWHERE)).toBe('The package says so.');
    });

    it('says a doubled score with why, and who ended the round', () => {
        expect(skyjoNote(12, 24, true)).toBe(
            'doubled from 12, for ending the round without the lowest score alone'
        );
        expect(skyjoNote(3, 3, true)).toBe('ended the round');
        expect(skyjoNote(9, 9, false)).toBe('');
    });

    it('says how a total adds up, before anything is typed and after', () => {
        expect(skyjoLineOf({ before: 0, held: undefined, first: true })).toBe(
            'Nothing this round yet.'
        );
        expect(skyjoLineOf({ before: 12, held: undefined, first: false })).toBe(
            '12 before this round.'
        );
        expect(skyjoLineOf({ before: 12, held: -3, first: false })).toBe(
            '12 before this round, and -3 this round.'
        );
    });
});

describe('a round of Skyjo', () => {
    it('holds the next player until a total is typed, and takes a total below zero', async () => {
        const { open } = await draw(skyjo(at({ part: 'entry', player: 'ann' })));
        const next = await screen.findByRole('button', { name: 'Next: Ben' });
        expect(next).toHaveAttribute('aria-disabled', 'true');
        expect(next).toHaveAccessibleDescription("Type Ann's total to go on.");
        fireEvent.click(key('Minus'));
        expect(next).toHaveAttribute('aria-disabled', 'true');
        fireEvent.click(key('5'));
        await waitFor(() => {
            expect(next).not.toHaveAttribute('aria-disabled', 'true');
        });
        fireEvent.click(next);
        await screen.findByRole('button', { name: 'Next: Cat' });
        const store = await open();
        const saved = await store.game('g-1');
        store.close();
        expect(saved?.draft?.round).toMatchObject({ entries: { ann: { total: -5 } } });
    });

    it('takes an entry out again when its total is deleted back to nothing', async () => {
        const { open } = await draw(skyjo(at({ part: 'entry', player: 'ann' })));
        await screen.findByRole('button', { name: 'Next: Ben' });
        fireEvent.click(key('7'));
        fireEvent.click(key('Delete'));
        await waitFor(async () => {
            const store = await open();
            const saved = await store.game('g-1');
            store.close();
            expect(saved?.draft?.round['entries']).toEqual({});
        });
        expect(dockButton('Next: Ben')).toHaveAttribute('aria-disabled', 'true');
    });

    it('adds up the cards tapped in, and takes one out by its own key', async () => {
        await draw(skyjo(at({ part: 'entry', player: 'ann' })));
        fireEvent.click(await screen.findByRole('tab', { name: 'Add it up for me' }));
        const cards = screen.getByRole('group', { name: 'Cards' });
        for (const card of ['12', 'minus 2', '7'])
            fireEvent.click(within(cards).getByRole('button', { name: card }));
        const strip = screen.getByRole('group', { name: 'Cards tapped in, 17 in all' });
        // Each card in the strip is named for what it takes out, in the order it was tapped in.
        for (const name of ['Take out 12', 'Take out minus 2', 'Take out 7'])
            expect(within(strip).getByRole('button', { name })).toBeTruthy();
        expect(within(strip).getAllByRole('button')).toHaveLength(3);
        fireEvent.click(within(strip).getByRole('button', { name: 'Take out 7' }));
        expect(screen.getByRole('group', { name: 'Cards tapped in, 10 in all' })).toBeTruthy();
        expect(document.querySelector('.gtt-score-line')?.textContent).toBe('10 this round.');
    });

    it('says beside the pad why a total is refused, and leaves it out of the total', async () => {
        await draw(skyjo(at({ part: 'entry', player: 'ann' })));
        await screen.findByRole('button', { name: 'Next: Ben' });
        for (const digit of ['9', '9', '9']) fireEvent.click(key(digit));
        expect(
            await screen.findByText('No hand comes to 999. A total is from -17 to 142.')
        ).toBeTruthy();
        expect(dockButton('Next: Ben')).toHaveAttribute('aria-disabled', 'true');
        // The header keeps the last total the rules took, so the refusal is said once.
        expect(document.querySelector('.gtt-score-line')?.textContent).toBe('99 this round.');
    });

    it('asks who ended the round among those who played it, and saves only once one is named', async () => {
        await draw(
            skyjo(
                at(
                    { part: 'ender', player: null },
                    {
                        entries: { ann: { total: 12 }, cat: { total: 20 } },
                        out: ['ben'],
                    }
                )
            )
        );
        const group = await screen.findByRole('radiogroup', { name: 'Who ended the round?' });
        expect(
            within(group)
                .getAllByRole('radio')
                .map((one) => one.getAttribute('value'))
        ).toEqual(['ann', 'cat']);
        expect(dockButton('Save the round')).toHaveAttribute('aria-disabled', 'true');
        expect(dockButton('Save the round')).toHaveAccessibleDescription(
            'Choose who ended the round to save it.'
        );
        fireEvent.click(within(group).getByRole('radio', { name: /^Cat/ }));
        expect(
            await screen.findByText("Cat's 20 doubles to 40, since Ann has as little or less.")
        ).toBeTruthy();
        fireEvent.click(dockButton('Save the round'));
        await waitFor(() => {
            expect(toast()?.textContent).toContain(
                'Round 1 saved. Ann 12. Ben out of the round. Cat 40, doubled from 20, for ending the round without the lowest score alone.'
            );
        });
    });

    it('opens a saved round again with its totals, its cards and who ended it', async () => {
        const round = {
            entries: { ann: { total: 5 }, ben: { cards: [12, -2] }, cat: { total: 20 } },
            ender: 'ann',
            out: [],
        };
        await draw(skyjo(at({ part: 'entry', player: 'ben' }, round), [round]));
        expect(await screen.findByRole('tab', { name: 'Add it up for me' })).toHaveAttribute(
            'aria-selected',
            'true'
        );
        expect(screen.getByRole('group', { name: 'Cards tapped in, 10 in all' })).toBeTruthy();
        expect(dockButton('Next: Cat')).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('passes over a player skipped for the round, who is not asked for a total', async () => {
        await draw(skyjo(at({ part: 'entry', player: 'ann' }, { entries: {}, out: ['ben'] })));
        await screen.findByRole('group', { name: 'Number pad' });
        fireEvent.click(key('3'));
        expect(await screen.findByRole('button', { name: 'Next: Cat' })).toBeTruthy();
    });

    it("leaves focus on the card that takes a taken card's place, or the one before it, or the pad", async () => {
        await draw(skyjo(at({ part: 'entry', player: 'ann' })));
        fireEvent.click(await screen.findByRole('tab', { name: 'Add it up for me' }));
        const cards = screen.getByRole('group', { name: 'Cards' });
        for (const card of ['12', '7', '3'])
            fireEvent.click(within(cards).getByRole('button', { name: card }));
        const chip = (name: string) => screen.getByRole('button', { name: `Take out ${name}` });
        // The first card taken out leaves focus on the card now in its place.
        chip('12').focus();
        fireEvent.click(chip('12'));
        await waitFor(() => {
            expect(chip('7')).toHaveFocus();
        });
        // The last card taken out leaves focus on the one before it, which keeps the strip's stop.
        chip('3').focus();
        fireEvent.click(chip('3'));
        await waitFor(() => {
            expect(chip('7')).toHaveFocus();
        });
        expect(chip('7')).toHaveAttribute('tabindex', '0');
        // The strip emptied, focus goes to the pad.
        fireEvent.click(chip('7'));
        await waitFor(() => {
            expect(document.activeElement?.closest('[aria-label="Cards"]')).toBeTruthy();
        });
    });

    it('keeps what is kept, and the last Undo, as the way a total is entered changes', async () => {
        const { open } = await draw(
            skyjo(at({ part: 'entry', player: 'ben' }, { entries: { ann: { total: 4 } } }))
        );
        await screen.findByRole('group', { name: 'Number pad' });
        fireEvent.click(key('2'));
        fireEvent.click(key('5'));
        fireEvent.click(screen.getByRole('tab', { name: 'Add it up for me' }));
        fireEvent.click(screen.getByRole('tab', { name: 'Type a total' }));
        expect(document.querySelector('.gtt-score-line')?.textContent).toBe('25 this round.');
        await waitFor(async () => {
            const store = await open();
            const saved = await store.game('g-1');
            store.close();
            expect(saved?.draft?.round['entries']).toMatchObject({ ben: { total: 25 } });
        });
    });

    it('takes digits, a minus sign and Backspace typed on a keyboard', async () => {
        await draw(skyjo(at({ part: 'entry', player: 'ann' })));
        const group = await screen.findByRole('group', { name: 'Number pad' });
        for (const typed of ['-', '1', '2', 'Backspace', '4'])
            fireEvent.keyDown(key('1'), { key: typed });
        expect(document.querySelector('.gtt-score-line')?.textContent).toBe('-14 this round.');
        expect(group).toBeTruthy();
    });

    it('says what naming a player as ender comes to as it is named, and describes the save by it', async () => {
        await draw(
            skyjo(
                at(
                    { part: 'ender', player: null },
                    {
                        entries: { ann: { total: 12 }, ben: { total: 9 }, cat: { total: 20 } },
                    }
                )
            )
        );
        const group = await screen.findByRole('radiogroup', { name: 'Who ended the round?' });
        fireEvent.click(within(group).getByRole('radio', { name: /^Ann/ }));
        const words = "Ann's 12 doubles to 24, since Ben has as little or less.";
        await said(screenLine(), words);
        expect(dockButton('Save the round')).toHaveAccessibleDescription(words);
    });

    it('says who is out as the question is reached, and puts them back to be asked first', async () => {
        await draw(
            skyjo(
                at(
                    { part: 'ender', player: null },
                    {
                        entries: { ann: { total: 12 }, ben: { total: 9 } },
                        out: ['cat'],
                    }
                )
            )
        );
        await screen.findByRole('radiogroup', { name: 'Who ended the round?' });
        await said(screenLine(), 'Cat is out of this round.');
        fireEvent.click(screen.getByRole('button', { name: 'Put Cat back' }));
        expect(await screen.findByRole('group', { name: 'Number pad' })).toBeTruthy();
        expect(document.querySelector('.gtt-score-name')?.textContent).toBe('Cat');
    });

    it("goes back to the last player's total from the question, with focus on their keys", async () => {
        await draw(
            skyjo(
                at(
                    { part: 'ender', player: null },
                    {
                        entries: { ann: { total: 12 }, ben: { total: 9 }, cat: { total: 20 } },
                    }
                )
            )
        );
        fireEvent.click(await screen.findByRole('button', { name: "Change Cat's total" }));
        await screen.findByRole('group', { name: 'Number pad' });
        await said(screenLine(), "Change Cat's total. It is 20.");
        expect(document.activeElement?.closest('#skyjo-entry')).toBeTruthy();
    });

    it('takes a player out and asks again who ended the round where a skip leaves it with no ender', async () => {
        await draw(
            skyjo(
                at(
                    { part: 'entry', player: 'cat' },
                    {
                        entries: { ann: { total: 30 }, ben: { total: 40 }, cat: { total: 10 } },
                        ender: 'cat',
                    }
                )
            )
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Skip Cat and finish the round' })
        );
        const group = await screen.findByRole('radiogroup', { name: 'Who ended the round?' });
        expect(
            within(group)
                .getAllByRole('radio')
                .map((one) => one.getAttribute('value'))
        ).toEqual(['ann', 'ben']);
    });

    it('says the round as it was saved where a skip finishes it, with the player out of it', async () => {
        await draw(
            skyjo(
                at(
                    { part: 'entry', player: 'cat' },
                    {
                        entries: { ann: { total: 30 }, ben: { total: 40 }, cat: { total: 10 } },
                        ender: 'ann',
                    }
                )
            )
        );
        fireEvent.click(
            await screen.findByRole('button', { name: 'Skip Cat and finish the round' })
        );
        await waitFor(() => {
            expect(toast()?.textContent).toContain(
                'Round 1 saved. Ann 30, ended the round. Ben 40. Cat out of the round.'
            );
        });
    });
});
