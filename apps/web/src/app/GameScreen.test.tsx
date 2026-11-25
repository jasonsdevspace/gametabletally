import type { Problem } from '@gametabletally/scoring';
import { IDBFactory } from 'fake-indexeddb';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';

import type { SavedGame, SavedPlayer } from '../store/format.js';
import { openStore } from '../store/store.js';
import { AppFrame } from './AppFrame.js';
import { answered, noWakeLock, wakeLockBrowser } from './awake.testing.js';
import { Flip7Keys, handOf, lineOf, refusalWords } from './flip7-round.js';
import { GameScreen } from './GameScreen.js';
import { act, appLine, fireEvent, render, screen, waitFor } from './render.testing.js';
import { busyWordsOf, canSkip, comesAfter, floorWords, outWords } from './round.js';
import { heard } from './status.testing.js';

/* The game in play in the app's frame, over a database in memory, and the words it draws. */

const player = (id: string, name: string): SavedPlayer => ({
    id,
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const flip7 = (draft: SavedGame['draft'] = null): SavedGame => ({
    id: 'g-1',
    game: 'flip-7',
    rules: 1,
    options: {},
    players: ['ann', 'ben', 'cat'],
    rounds: [],
    draft,
    started: '2026-11-14T10:00:00Z',
    changed: '2026-11-14T10:00:00Z',
});

const AT_ANN: SavedGame['draft'] = {
    index: 0,
    round: { entries: {}, out: [] },
    step: { part: 'entry', player: 'ann' },
};

/** The screen at a game's address, over a database holding the game and its players. */
const draw = async (saved: SavedGame | null = flip7(AT_ANN), id = 'g-1') => {
    window.history.replaceState(null, '', `/game/?id=${id}`);
    const factory = new IDBFactory();
    const store = await openStore(factory);
    for (const one of [player('ann', 'Ann'), player('ben', 'Ben'), player('cat', 'Cat')])
        await store.savePlayer(one);
    if (saved !== null) await store.saveGame(saved);
    store.close();
    render(
        <AppFrame screen="game" title="Game in play">
            <GameScreen
                open={() => openStore(factory)}
                now={() => new Date('2026-11-15T09:00:00Z')}
            />
        </AppFrame>
    );
    // The screen reads the database once it is running, so the keys come once it has.
    if (saved?.draft) await screen.findByRole('button', { name: 'Bust' });
    return { open: () => openStore(factory) };
};

const press = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name }));
};

const digits = () => document.querySelector('.gtt-digits');

describe('the words a round says while it moves on', () => {
    it('names the save it makes, the entry it keeps, and nothing where it saves nothing', () => {
        expect(busyWordsOf('Save the round')).toBe('Saving the round.');
        expect(busyWordsOf('Save round 2')).toBe('Saving round 2.');
        expect(busyWordsOf('Save the bids')).toBe('Saving the bids.');
        expect(busyWordsOf('Next: Ben')).toBe('Keeping the entry.');
        expect(busyWordsOf('Next: who ended the round')).toBe('Keeping the entry.');
        expect(busyWordsOf('Enter the tricks')).toBe('');
    });

    it('leaves the button that moves on unmarked while a skip is saved, which is not its press', async () => {
        window.history.replaceState(null, '', '/game/?id=g-1');
        const factory = new IDBFactory();
        const store = await openStore(factory);
        for (const one of [player('ann', 'Ann'), player('ben', 'Ben'), player('cat', 'Cat')])
            await store.savePlayer(one);
        await store.saveGame(flip7(AT_ANN));
        store.close();
        // Saves wait once the screen is open, so the skip stays under way.
        let hold = false;
        const gate: { open?: () => void } = {};
        const held = new Promise<void>((resolve) => {
            gate.open = resolve;
        });
        const open = async () => {
            const opened = await openStore(factory);
            return {
                ...opened,
                saveGame: async (game: SavedGame) => {
                    if (hold) await held;
                    return opened.saveGame(game);
                },
            };
        };
        render(
            <AppFrame screen="game" title="Game in play">
                <GameScreen open={open} now={() => new Date('2026-11-15T09:00:00Z')} />
            </AppFrame>
        );
        const next = await screen.findByRole('button', { name: 'Next: Ben' });
        hold = true;
        press('Skip Ann this round');
        await waitFor(() => {
            expect(next).toHaveAttribute('aria-disabled', 'true');
        });
        expect(next).not.toHaveAttribute('data-busy');
        gate.open?.();
        await heard(appLine(), 'Ann is out of round 1');
    });

    it('marks the button that moves on busy with the words for its press', async () => {
        await draw();
        const next = screen.getByRole('button', { name: 'Next: Ben' });
        fireEvent.click(next);
        expect(next).toHaveAttribute('data-busy', 'Keeping the entry.');
    });
});

describe('a game that could not be read', () => {
    it('reads it afresh from Try again, with focus on the screen once the callout goes', async () => {
        window.history.replaceState(null, '', '/game/?id=g-1');
        const factory = new IDBFactory();
        const store = await openStore(factory);
        for (const one of [player('ann', 'Ann'), player('ben', 'Ben'), player('cat', 'Cat')])
            await store.savePlayer(one);
        await store.saveGame(flip7(AT_ANN));
        store.close();
        let failing = true;
        render(
            <AppFrame screen="game" title="Game in play">
                <GameScreen
                    open={() =>
                        failing
                            ? Promise.reject(new Error('No database here.'))
                            : openStore(factory)
                    }
                    now={() => new Date('2026-11-15T09:00:00Z')}
                />
            </AppFrame>
        );
        const again = await screen.findByRole('button', { name: 'Try again' });
        again.focus();
        failing = false;
        fireEvent.click(again);
        await screen.findByRole('button', { name: 'Bust' });
        await waitFor(() => {
            expect(screen.getByRole('main')).toHaveFocus();
        });
    });
});

describe('the words the game screen draws', () => {
    it('words a hand of too many numbers from its code and data', () => {
        const problem: Problem = {
            code: 'too-many-numbers',
            message: 'The round ends at 7 different numbers.',
            data: { max: 7, given: 8 },
            round: 0,
            player: 'ann',
        };
        expect(refusalWords(problem)).toBe(
            'A round ends at 7 numbers, so a hand holds no more. Take one off.'
        );
    });

    it("words a code the keys cannot meet by the package's own sentence", () => {
        const problem: Problem = {
            code: 'unknown-player',
            message: 'The round names a player who is not in the game.',
            data: {},
            round: 0,
            player: null,
        };
        expect(refusalWords(problem)).toBe(problem.message);
    });

    it('says how a total adds up, in the first round and after it, with a bust and the bonus', () => {
        const hand = { numbers: [3, 7], modifiers: [], bust: false } as const;
        expect(lineOf({ before: 0, round: 10, first: true, hand })).toBe('10 this round.');
        expect(lineOf({ before: 42, round: 10, first: false, hand })).toBe(
            '42 before this round, and 10 this round.'
        );
        expect(lineOf({ before: 42, round: 0, first: false, hand: { ...hand, bust: true } })).toBe(
            '42 before this round, and bust this round, so nothing.'
        );
        expect(
            lineOf({
                before: 0,
                round: 36,
                first: true,
                hand: { ...hand, numbers: [0, 1, 2, 3, 4, 5, 6] },
            })
        ).toBe('36 this round, with 15 for 7 numbers.');
    });

    it('reads a hand as the round holds it, and an empty one from anything else', () => {
        expect(handOf({ numbers: [3, 'x'], modifiers: ['+4', '+3'], bust: false })).toEqual({
            numbers: [3],
            modifiers: ['+4'],
            bust: false,
        });
        expect(handOf(undefined)).toEqual({ numbers: [], modifiers: [], bust: false });
    });
});

describe('the game screen', () => {
    it('keeps each tap and shows the round as it stands in the header', async () => {
        const { open } = await draw();
        press('3');
        press('7');
        press('+4');
        await waitFor(() => {
            expect(digits()).toHaveAccessibleName('14');
        });
        await heard(appLine(), "Ann's total is 14.");
        expect(screen.getByRole('button', { name: '7' })).toHaveAttribute('aria-pressed', 'true');
        const store = await open();
        expect((await store.game('g-1'))?.draft?.round['entries']).toEqual({
            ann: { numbers: [3, 7], modifiers: ['+4'], bust: false },
        });
        store.close();
    });

    it('clears the hand on a bust, says so beside it, and takes it back', async () => {
        await draw();
        press('5');
        press('Bust');
        const bust = screen.getByRole('button', { name: 'Bust' });
        expect(bust).toHaveAttribute('aria-pressed', 'true');
        expect(bust).toHaveAccessibleDescription(
            'Ann bust, so nothing counts this round. Press Bust again to take it back.'
        );
        expect(screen.getByRole('button', { name: '5' })).toHaveAttribute('aria-pressed', 'false');
        expect(screen.getByRole('button', { name: '5' })).toHaveAttribute('aria-disabled', 'true');
        await heard(appLine(), "Ann's total is 0.");
        press('Bust');
        expect(bust).toHaveAttribute('aria-pressed', 'false');
    });

    it('says in words beside the keys why a hand is refused, and holds the next player', async () => {
        await draw();
        for (const card of ['0', '1', '2', '3', '4', '5', '6', '7']) press(card);
        const why = 'A round ends at 7 numbers, so a hand holds no more. Take one off.';
        expect(await screen.findByText(why)).toBeVisible();
        await heard(appLine(), why);
        expect(screen.getByRole('toolbar', { name: 'Number cards' })).toHaveAccessibleDescription(
            why
        );
        expect(screen.getByRole('button', { name: 'Next: Ben' })).toHaveAttribute(
            'aria-disabled',
            'true'
        );
    });

    it('names the next player, and moves to them', async () => {
        await draw();
        press('Next: Ben');
        await heard(appLine(), 'Ben is next.');
        expect(document.querySelector('.gtt-score-name')).toHaveTextContent('Ben');
        expect(screen.getByRole('button', { name: 'Next: Cat' })).toBeVisible();
    });

    it('says a game it does not hold', async () => {
        await draw(null);
        expect(
            await screen.findByText('This game is not on this phone. It may have been deleted.')
        ).toBeVisible();
        expect(screen.getByRole('link', { name: 'Go to the history' })).toHaveAttribute(
            'href',
            '/history/'
        );
    });

    it('says a game that is over', async () => {
        await draw(flip7(null));
        await act(() => Promise.resolve());
        expect(await screen.findByText('This game of Flip 7 is over.')).toBeVisible();
        expect(screen.getByRole('link', { name: 'See the recap' }).getAttribute('href')).toBe(
            '/recap/?id=g-1'
        );
    });
});

describe('keeping the screen awake through a game', () => {
    afterEach(noWakeLock);

    it('asks to keep the screen awake while the game is in play', async () => {
        const { request } = wakeLockBrowser();
        await draw();
        await answered();
        expect(request).toHaveBeenCalledWith('screen');
    });

    it('asks for nothing once the game is over', async () => {
        const { request } = wakeLockBrowser();
        await draw(flip7(null));
        expect(await screen.findByText('This game of Flip 7 is over.')).toBeVisible();
        await answered();
        expect(request).not.toHaveBeenCalled();
    });
});

describe('the game screen as the turn moves on', () => {
    it('ignores a tap made while the hand is entered, so it never lands in the next seat', async () => {
        const { open } = await draw();
        press('3');
        await heard(appLine(), "Ann's total is 3.");
        press('Next: Ben');
        press('9');
        await heard(appLine(), 'Ben is next.');
        const store = await open();
        expect((await store.game('g-1'))?.draft?.round['entries']).toEqual({
            ann: { numbers: [3], modifiers: [], bust: false },
        });
        store.close();
    });

    it('ignores a tap made while Undo puts a hand back, so it never lands in the player it restores', async () => {
        const { open } = await draw();
        press('3');
        await heard(appLine(), "Ann's total is 3.");
        press('Next: Ben');
        await heard(appLine(), 'Ben is next.');
        const undo = await screen.findByRole('button', { name: 'Undo' });
        fireEvent.click(undo);
        press('9');
        await heard(appLine(), 'Ann is next.');
        const store = await open();
        expect((await store.game('g-1'))?.draft?.round['entries']).toEqual({
            ann: { numbers: [3], modifiers: [], bust: false },
        });
        store.close();
    });

    it('counts a reopened round once in the header, as it stands', async () => {
        const saved: SavedGame = {
            ...flip7({
                index: 0,
                round: {
                    entries: {
                        ann: { numbers: [12, 8], modifiers: [], bust: false },
                        ben: { numbers: [], modifiers: [], bust: true },
                        cat: { numbers: [], modifiers: [], bust: true },
                    },
                    out: [],
                },
                step: { part: 'entry', player: 'ann' },
            }),
            rounds: [
                {
                    entries: {
                        ann: { numbers: [12, 8], modifiers: [], bust: false },
                        ben: { numbers: [], modifiers: [], bust: true },
                        cat: { numbers: [], modifiers: [], bust: true },
                    },
                },
            ],
        };
        await draw(saved);
        await waitFor(() => {
            expect(digits()).toHaveAccessibleName('20');
        });
        expect(document.querySelector('.gtt-score-line')).toHaveTextContent('20 this round.');
    });

    it('says the games could not be read when reading them fails', async () => {
        window.history.replaceState(null, '', '/game/?id=g-1');
        const factory = new IDBFactory();
        render(
            <AppFrame screen="game" title="Game in play">
                <GameScreen
                    open={async () => {
                        const store = await openStore(factory);
                        return {
                            ...store,
                            games: () => Promise.reject(new Error('The record is not readable.')),
                        };
                    }}
                />
            </AppFrame>
        );
        await waitFor(() => {
            expect(screen.getByRole('alert')).toHaveTextContent(
                'Your saved games could not be read.'
            );
        });
    });
});

describe('the words for skipping a player', () => {
    const round = (out: string[], entries: Record<string, unknown> = {}) => ({ entries, out });

    it('lets a round spare a player only while it keeps two', () => {
        expect(canSkip(['ann', 'ben', 'cat'], round([]))).toBe(true);
        expect(canSkip(['ann', 'ben', 'cat'], round(['ann']))).toBe(false);
        expect(canSkip(['ann', 'ben'], round([]))).toBe(false);
    });

    it('says who is out of a round, one or several, and why no one else can be', () => {
        expect(outWords(['Ann'])).toBe('Ann is out of this round.');
        expect(outWords(['Ann', 'Ben'])).toBe('Ann and Ben are out of this round.');
        expect(floorWords([])).toBe(
            'A round needs two players, so no one else can sit this one out.'
        );
        expect(floorWords(['Ann'])).toBe('Ann is out, and a round needs two players.');
    });

    it('says who a player put back comes after, from the player whose turn it is', () => {
        const players = ['ann', 'ben', 'cat', 'dan'];
        const atCat = { game: 'flip-7', players, round: round([], { ben: {} }) };
        expect(comesAfter(atCat, 'cat', 'ann')).toEqual({ player: 'dan', now: false });
        expect(comesAfter(atCat, 'cat', 'dan')).toEqual({ player: 'cat', now: true });
        expect(comesAfter(atCat, 'cat', 'cat')).toBeNull();
    });
});

describe('skipping a player for a round', () => {
    const skipButton = () => document.getElementById('skip-player');

    it('skips the player whose turn it is, says so, and keeps focus on the skip for the next', async () => {
        const four = { ...flip7(AT_ANN), players: ['ann', 'ben', 'cat', 'dan'] };
        window.history.replaceState(null, '', '/game/?id=g-1');
        const factory = new IDBFactory();
        const store = await openStore(factory);
        for (const one of [
            player('ann', 'Ann'),
            player('ben', 'Ben'),
            player('cat', 'Cat'),
            player('dan', 'Dan'),
        ])
            await store.savePlayer(one);
        await store.saveGame(four);
        store.close();
        render(
            <AppFrame screen="game" title="Game in play">
                <GameScreen open={() => openStore(factory)} />
            </AppFrame>
        );
        const skip = await screen.findByRole('button', { name: 'Skip Ann this round' });
        skip.focus();
        fireEvent.click(skip);
        // Said with who is next, since the header's own words are said a moment before.
        await heard(
            appLine(),
            "Ann is out of round 1, with no score for it. Ann's total stays at 0. Ben is next."
        );
        expect(document.querySelector('.gtt-score-name')).toHaveTextContent('Ben');
        expect(screen.getByText('Ann is out of this round.')).toBeVisible();
        expect(skipButton()).toHaveTextContent('Skip Ben this round');
        expect(skipButton()).toHaveFocus();
        // Put back while Ben enters, Ann is asked after the others still to enter.
        fireEvent.click(screen.getByRole('button', { name: 'Put Ann back' }));
        await heard(appLine(), 'Ann is back in round 1, and is asked after Dan.');
        expect(screen.queryByText('Ann is out of this round.')).toBeNull();
        await waitFor(() => {
            expect(skipButton()).toHaveFocus();
        });
    });

    it('offers no skip that would leave one player, says why, and still puts a player back', async () => {
        await draw();
        press('Skip Ann this round');
        await heard(
            appLine(),
            "Ann is out of round 1, with no score for it. Ann's total stays at 0."
        );
        expect(skipButton()).toBeNull();
        expect(screen.getByText('Ann is out, and a round needs two players.')).toBeVisible();
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Put Ann back' })).toHaveFocus();
        });
        press('Put Ann back');
        await heard(appLine(), 'Ann is back in round 1, and is asked after Cat.');
        expect(skipButton()).toHaveTextContent('Skip Ben this round');
        await waitFor(() => {
            expect(skipButton()).toHaveFocus();
        });
    });

    it('says from the start of a game of two that no one can sit a round out', async () => {
        await draw({ ...flip7(AT_ANN), players: ['ann', 'ben'] });
        expect(skipButton()).toBeNull();
        expect(
            screen.getByText('A round needs two players, so no one else can sit this one out.')
        ).toBeVisible();
    });

    it('takes the last summary away as a player is skipped, so its Undo cannot take back the skip', async () => {
        await draw();
        press('Next: Ben');
        expect(await screen.findByRole('button', { name: 'Undo' })).toBeVisible();
        // The toast draws Undo as the entry is kept, a moment before the screen takes a tap again,
        // so the skip is pressed once it is live.
        await waitFor(() => {
            expect(screen.getByRole('button', { name: 'Skip Ben this round' })).not.toHaveAttribute(
                'aria-disabled',
                'true'
            );
        });
        expect(screen.getByRole('button', { name: 'Undo' })).toBeVisible();
        press('Skip Ben this round');
        await heard(
            appLine(),
            "Ben is out of round 1, with no score for it. Ben's total stays at 0."
        );
        expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
    });

    it('skips the last player still to enter and saves the round at once', async () => {
        const { open } = await draw(
            flip7({
                index: 0,
                round: {
                    entries: { ann: handOf({ numbers: [3] }), ben: handOf({ numbers: [4] }) },
                    out: [],
                },
                step: { part: 'entry', player: 'cat' },
            })
        );
        press('Skip Cat and finish the round');
        await waitFor(async () => {
            const store = await open();
            const saved = await store.game('g-1');
            store.close();
            expect(saved?.rounds).toEqual([
                {
                    entries: { ann: handOf({ numbers: [3] }), ben: handOf({ numbers: [4] }) },
                    out: ['cat'],
                },
            ]);
        });
        expect(await screen.findByText(/Cat out of the round/)).toBeVisible();
    });
});

describe('the card grids, one stop each', () => {
    const grid = (name: string) => screen.getByRole('toolbar', { name });
    const stops = (name: string) => grid(name).querySelectorAll('[tabindex="0"]').length;

    it('writes each grid as a group, which the kit names a toolbar once it is attached', () => {
        const markup = renderToStaticMarkup(
            <Flip7Keys
                name="Ann"
                hand={{ numbers: [], modifiers: [], bust: false }}
                why=""
                onChange={() => undefined}
            />
        );
        for (const name of ['Number cards', 'Modifier cards'])
            expect(markup).toMatch(
                new RegExp(
                    `role="group" aria-label="${name}"|aria-label="${name}"[^>]*role="group"`
                )
            );
    });

    it('gives each grid one stop, and leaves an arrow held with a modifier key to the browser', async () => {
        await draw();
        expect(stops('Number cards')).toBe(1);
        expect(stops('Modifier cards')).toBe(1);
        const zero = screen.getByRole('button', { name: '0' });
        zero.focus();
        // fireEvent says whether the event went on unprevented.
        expect(fireEvent.keyDown(zero, { key: 'ArrowLeft', altKey: true })).toBe(true);
        expect(fireEvent.keyDown(zero, { key: 'ArrowRight', metaKey: true })).toBe(true);
        expect(fireEvent.keyDown(zero, { key: 'ArrowRight' })).toBe(false);
        expect(screen.getByRole('button', { name: '1' })).toHaveFocus();
    });

    it("moves a grid's stop to a card that is tapped, as browsers that do not focus a tapped button need", async () => {
        await draw();
        fireEvent.click(screen.getByRole('button', { name: '5' }));
        expect(screen.getByRole('button', { name: '5' })).toHaveAttribute('tabindex', '0');
        expect(screen.getByRole('button', { name: '0' })).toHaveAttribute('tabindex', '-1');
    });

    it("starts each player's grids at their first card", async () => {
        await draw();
        fireEvent.click(screen.getByRole('button', { name: '9' }));
        expect(screen.getByRole('button', { name: '9' })).toHaveAttribute('tabindex', '0');
        press('Next: Ben');
        await heard(appLine(), 'Ben is next.');
        expect(screen.getByRole('button', { name: '0' })).toHaveAttribute('tabindex', '0');
        expect(stops('Number cards')).toBe(1);
    });
});
