import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { SavedGame, SavedPlayer } from '../store/format.js';
import { openStore } from '../store/store.js';
import { AppFrame } from './AppFrame.js';
import { GameScreen } from './GameScreen.js';
import { act, appLine, fireEvent, render, screen, waitFor, within } from './render.testing.js';
import { heard } from './status.testing.js';
import { bidNote, countIn, countsOf, dealerOf, tricksLeftWords } from './wizard-round.js';

/* A round of Wizard in the app's frame, over a database in memory, and the words it draws. */

const player = (id: string, name: string): SavedPlayer => ({
    id,
    name,
    added: '2026-11-01T10:00:00Z',
    removed: false,
});

const PLAYERS = ['ann', 'ben', 'cat'];

const wizard = (draft: SavedGame['draft'], rounds: unknown[] = []): SavedGame => ({
    id: 'g-1',
    game: 'wizard',
    rules: 1,
    options: {},
    players: PLAYERS,
    rounds,
    draft,
    started: '2026-11-14T10:00:00Z',
    changed: '2026-11-14T10:00:00Z',
});

const at = (
    step: NonNullable<SavedGame['draft']>['step'],
    round: Record<string, unknown> = {},
    index = 0
): SavedGame['draft'] => ({ index, round: { entries: {}, out: [], ...round }, step });

/** A round saved with each player's bid and tricks. */
const saved = (counts: Record<string, [number, number]>) => ({
    entries: Object.fromEntries(
        Object.entries(counts).map(([one, [bid, tricks]]) => [one, { bid, tricks }])
    ),
    out: [],
});

/** The screen at the game's address, over a database holding the game and its players. */
const draw = async (game: SavedGame) => {
    window.history.replaceState(null, '', '/game/?id=g-1');
    const factory = new IDBFactory();
    const store = await openStore(factory);
    for (const one of [player('ann', 'Ann'), player('ben', 'Ben'), player('cat', 'Cat')])
        await store.savePlayer(one);
    await store.saveGame(game);
    store.close();
    const { unmount } = render(
        <AppFrame screen="game" title="Game in play">
            <GameScreen
                open={() => openStore(factory)}
                now={() => new Date('2026-11-15T09:00:00Z')}
            />
        </AppFrame>
    );
    await screen.findByText(/^Round \d+ of \d+$/);
    return { open: () => openStore(factory), unmount };
};

const dockButton = (name: string) =>
    within(screen.getByRole('region', { name: 'Actions' })).getByRole('button', { name });
const toast = () => document.querySelector('.dk-app-toast [role="status"]');
const screenLine = appLine;
const count = (id: string): HTMLInputElement | null => {
    const element = document.getElementById(id);
    return element instanceof HTMLInputElement ? element : null;
};
const setCount = (id: string, value: number) => {
    const input = count(id);
    if (input === null) throw new Error(`There is no count ${id}.`);
    fireEvent.change(input, { target: { value: String(value) } });
};

describe('the words and numbers of a Wizard round', () => {
    it('reads a count typed as a whole number from nothing to the most, and nothing else', () => {
        expect(countIn('2', 3)).toBe(2);
        expect(countIn('0', 3)).toBe(0);
        expect(countIn('4', 3)).toBeNull();
        expect(countIn('', 3)).toBeNull();
        expect(countIn('-1', 3)).toBeNull();
        expect(countIn('1.5', 3)).toBeNull();
    });

    it('moves the dealer one seat each round, passing over a player out of it', () => {
        const round = { entries: {}, out: [] };
        expect(dealerOf(PLAYERS, round, 0)).toBe('ann');
        expect(dealerOf(PLAYERS, round, 1)).toBe('ben');
        expect(dealerOf(PLAYERS, round, 3)).toBe('ann');
        expect(dealerOf(PLAYERS, { entries: {}, out: ['ben'] }, 1)).toBe('cat');
    });

    it('tells a bid made from one missed, in words', () => {
        expect(bidNote(2, 2)).toBe('made a bid of 2');
        expect(bidNote(2, 4)).toBe('missed a bid of 2 by 2');
    });

    it('counts the tricks still to give, and says how many too many', () => {
        expect(tricksLeftWords(1, 3)).toBe('2 tricks still to enter, of 3 in the hand.');
        expect(tricksLeftWords(2, 3)).toBe('1 trick still to enter, of 3 in the hand.');
        expect(tricksLeftWords(3, 3)).toBe('Every trick is in, 3 of 3.');
        expect(tricksLeftWords(5, 3)).toBe(
            'The tricks come to 5, 2 more than the 3 in the hand. Take 2 off.'
        );
        expect(tricksLeftWords(4, 3)).toBe(
            'The tricks come to 4, 1 more than the 3 in the hand. Take 1 off.'
        );
    });

    it("reads a player's bid and tricks as the round holds them", () => {
        expect(countsOf({ bid: 2 })).toEqual({ bid: 2, tricks: undefined });
        expect(countsOf({ bid: 2, tricks: 1 })).toEqual({ bid: 2, tricks: 1 });
        expect(countsOf(null)).toEqual({ bid: undefined, tricks: undefined });
    });
});

describe('a round of Wizard', () => {
    it('sets every bid, from nothing to the cards dealt, and shows them through the hand once saved', async () => {
        const { open } = await draw(
            wizard(at({ part: 'bid', player: 'ann' }, {}, 1), [
                saved({ ann: [0, 0], ben: [1, 1], cat: [0, 0] }),
            ])
        );
        expect(screen.getByText('2 cards each, Ben deals')).toBeTruthy();
        expect(count('bid-ann')).toHaveAttribute('max', '2');
        setCount('bid-ann', 2);
        setCount('bid-cat', 1);
        fireEvent.click(dockButton('Save the bids'));
        expect(
            await screen.findByRole('heading', { name: 'The bids, while the hand is played' })
        ).toBeTruthy();
        const store = await open();
        const game = await store.game('g-1');
        store.close();
        expect(game?.draft?.round).toMatchObject({
            entries: { ann: { bid: 2 }, ben: { bid: 0 }, cat: { bid: 1 } },
        });
        await waitFor(() => {
            expect(toast()?.textContent).toContain(
                'The bids for round 2 are in: Ann 2, Ben 0 and Cat 1.'
            );
        });
    });

    it("says nothing and leaves no timer when the round's screen goes while a typed count settles", async () => {
        const { unmount } = await draw(
            wizard(
                at(
                    { part: 'tricks', player: 'ann' },
                    {
                        entries: { ann: { bid: 1 }, ben: { bid: 1 }, cat: { bid: 0 } },
                    },
                    1
                ),
                [saved({ ann: [1, 1], ben: [0, 0], cat: [0, 0] })]
            )
        );
        fireEvent.click(dockButton('Enter the tricks'));
        await heard(screenLine(), 'Enter the tricks for round 2.');
        // The words leave the line before the page's timers are faked, so no timer the line set
        // with the real clock is left running unseen.
        await waitFor(
            () => {
                expect(screenLine()).toHaveTextContent('');
            },
            { timeout: 3000 }
        );
        // Only the page's own timers are faked, so the database in memory keeps its own.
        vi.useFakeTimers({
            toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
        });
        setCount('tricks-ben', 0);
        const line = screenLine();
        unmount();
        // Microtasks run, as the kit lets the line go in one, and the faked clock stands still, so
        // a timer still set is counted rather than run out.
        await act(async () => {
            await Promise.resolve();
        });
        expect(vi.getTimerCount()).toBe(0);
        act(() => {
            vi.advanceTimersByTime(1000);
        });
        expect(line.textContent).toBe('');
    });

    it('says the tricks still to enter with the value a press sets, in one message', async () => {
        await draw(
            wizard(
                at(
                    { part: 'tricks', player: 'ann' },
                    {
                        entries: { ann: { bid: 1 }, ben: { bid: 1 }, cat: { bid: 0 } },
                    },
                    1
                ),
                [saved({ ann: [1, 1], ben: [0, 0], cat: [0, 0] })]
            )
        );
        fireEvent.click(dockButton('Enter the tricks'));
        fireEvent.click(screen.getByRole('button', { name: "Lower Ben's tricks" }));
        await heard(screenLine(), tricksLeftWords(1, 2));
    });

    it('lets go of the tricks still to enter, not yet said, once the round is saved', async () => {
        await draw(
            wizard(
                at(
                    { part: 'tricks', player: 'ann' },
                    {
                        entries: { ann: { bid: 1 }, ben: { bid: 1 }, cat: { bid: 0 } },
                    },
                    1
                ),
                [saved({ ann: [1, 1], ben: [0, 0], cat: [0, 0] })]
            )
        );
        fireEvent.click(dockButton('Enter the tricks'));
        await heard(screenLine(), 'Enter the tricks for round 2.');
        const said: string[] = [];
        const watch = new MutationObserver(() => {
            said.push(screenLine().textContent);
        });
        watch.observe(screenLine(), { childList: true, characterData: true, subtree: true });
        // Typed over and back, then saved before the typing has rested.
        setCount('tricks-ben', 0);
        setCount('tricks-ben', 1);
        fireEvent.click(dockButton('Save the round'));
        await waitFor(() => {
            expect(toast()?.textContent).toContain('Round 2 saved.');
        });
        await act(() => new Promise((resolve) => setTimeout(resolve, 1000)));
        watch.disconnect();
        expect(said.filter((words) => words.includes('trick'))).toEqual([]);
    });

    it('starts the tricks at the bids, and saves only once they add up, saying why', async () => {
        await draw(
            wizard(
                at(
                    { part: 'tricks', player: 'ann' },
                    {
                        entries: { ann: { bid: 1 }, ben: { bid: 1 }, cat: { bid: 0 } },
                    },
                    1
                ),
                [saved({ ann: [1, 1], ben: [0, 0], cat: [0, 0] })]
            )
        );
        fireEvent.click(dockButton('Enter the tricks'));
        expect(count('tricks-ann')?.value).toBe('1');
        expect(count('tricks-ben')?.value).toBe('1');
        expect(screen.getByText('Every trick is in, 2 of 2.')).toBeTruthy();
        setCount('tricks-ben', 2);
        await heard(
            screenLine(),
            'The tricks come to 3, 1 more than the 2 in the hand. Take 1 off.'
        );
        const save = dockButton('Save the round');
        expect(save).toHaveAttribute('aria-disabled', 'true');
        expect(save).toHaveAccessibleDescription(
            'The tricks come to 3, 1 more than the 2 in the hand. Take 1 off.'
        );
        setCount('tricks-ann', 0);
        fireEvent.click(dockButton('Save the round'));
        await waitFor(() => {
            expect(toast()?.textContent).toContain(
                'Round 2 saved. Ann -10, missed a bid of 1 by 1. Ben -10, missed a bid of 1 by 1. Cat 20, made a bid of 0.'
            );
        });
    });

    it('passes over a player skipped for the round, who has no bid, and puts them back', async () => {
        await draw(wizard(at({ part: 'bid', player: 'ann' })));
        fireEvent.click(screen.getByRole('button', { name: 'Skip a player this round' }));
        fireEvent.click(screen.getByRole('button', { name: 'Skip Ben' }));
        await waitFor(() => {
            expect(count('bid-ben')).toBeNull();
        });
        expect(screen.getByText('Ben is out of this round.')).toBeTruthy();
        // The way to put Ben back is live once the skip is done.
        const putBack = screen.getByRole('button', { name: 'Put Ben back' });
        await waitFor(() => {
            expect(putBack).not.toHaveAttribute('aria-disabled', 'true');
        });
        fireEvent.click(putBack);
        await waitFor(() => {
            expect(count('bid-ben')).not.toBeNull();
        });
    });

    it('opens a saved round again with its bids, then its tricks, and saves it in place', async () => {
        const round = saved({ ann: [1, 1], ben: [0, 0], cat: [0, 0] });
        await draw(wizard(at({ part: 'bid', player: 'ann' }, round, 0), [round]));
        expect(count('bid-ann')?.value).toBe('1');
        fireEvent.click(dockButton('Save the bids'));
        await waitFor(() => {
            expect(count('tricks-ann')?.value).toBe('1');
        });
        await waitFor(() => {
            expect(dockButton('Save round 1')).not.toHaveAttribute('aria-disabled', 'true');
        });
    });

    it('keeps every other count as set when a player is skipped', async () => {
        await draw(
            wizard(at({ part: 'bid', player: 'ann' }, {}, 1), [
                saved({ ann: [0, 0], ben: [1, 1], cat: [0, 0] }),
            ])
        );
        setCount('bid-ann', 2);
        fireEvent.click(screen.getByRole('button', { name: 'Skip a player this round' }));
        fireEvent.click(screen.getByRole('button', { name: 'Skip Ben' }));
        await waitFor(() => {
            expect(count('bid-ben')).toBeNull();
        });
        expect(count('bid-ann')?.value).toBe('2');
    });

    it('keeps the bids as they are set, so the page comes back to them', async () => {
        const { open } = await draw(
            wizard(at({ part: 'bid', player: 'ann' }, {}, 1), [
                saved({ ann: [0, 0], ben: [1, 1], cat: [0, 0] }),
            ])
        );
        setCount('bid-cat', 2);
        await waitFor(async () => {
            const store = await open();
            const game = await store.game('g-1');
            store.close();
            expect(game?.draft?.round['entries']).toMatchObject({ cat: { bid: 2 } });
            expect(game?.draft?.step).toEqual({ part: 'bid', player: 'ann' });
        });
    });

    it('keeps what is typed, says why a count out of its limits holds the round, and saves once it is put right', async () => {
        await draw(wizard(at({ part: 'bid', player: 'ann' })));
        setCount('bid-ann', 7);
        expect(count('bid-ann')?.value).toBe('7');
        const save = dockButton('Save the bids');
        expect(save).toHaveAttribute('aria-disabled', 'true');
        expect(save).toHaveAccessibleDescription("Ann's bid can be from 0 to 1.");
        setCount('bid-ann', 1);
        expect(save).not.toHaveAttribute('aria-disabled', 'true');
    });

    it('names each count for its player and what it counts, and describes its limits', async () => {
        await draw(wizard(at({ part: 'bid', player: 'ann' })));
        expect(
            screen.getByRole('spinbutton', { name: 'Ann deals, bid' })
        ).toHaveAccessibleDescription('From 0 to 1.');
        expect(screen.getByRole('spinbutton', { name: 'Ben, bid' })).toBeTruthy();
    });

    it('requires every count, and words its error without the player, whom the kit names first', async () => {
        await draw(wizard(at({ part: 'bid', player: 'ann' })));
        expect(count('bid-ann')).toBeRequired();
        expect(count('bid-ben')).toBeRequired();
        expect(document.getElementById('bid-ann-range')).toHaveTextContent(
            /^Error: ?Enter a bid from 0 to 1\.$/
        );
    });

    it('asks a player put back once the bids are saved for their bid, keeping the others', async () => {
        await draw(
            wizard(
                at(
                    { part: 'tricks', player: 'ann' },
                    {
                        entries: { ann: { bid: 1 }, cat: { bid: 0 } },
                        out: ['ben'],
                    },
                    1
                ),
                [saved({ ann: [1, 1], ben: [0, 0], cat: [0, 0] })]
            )
        );
        const said: string[] = [];
        const watch = new MutationObserver(() => {
            said.push(screenLine().textContent);
        });
        watch.observe(screenLine(), { childList: true, characterData: true, subtree: true });
        fireEvent.click(await screen.findByRole('button', { name: 'Put Ben back' }));
        await waitFor(() => {
            expect(count('bid-ben')).not.toBeNull();
        });
        expect(count('bid-ann')?.value).toBe('1');
        await heard(screenLine(), "Ben is back in round 2. Set Ben's bid.");
        watch.disconnect();
        // Said once, in the round's own words, and never in the words every game says.
        expect(said.filter((words) => words.includes('is back'))).toEqual([
            "Ben is back in round 2. Set Ben's bid.",
        ]);
        expect(document.activeElement?.id).toBe('counts-line');
    });

    it('goes back to the bids from the tricks with focus on them, and from the bids to the hand', async () => {
        await draw(
            wizard(
                at(
                    { part: 'tricks', player: 'ann' },
                    {
                        entries: { ann: { bid: 1 }, ben: { bid: 1 }, cat: { bid: 0 } },
                    },
                    1
                ),
                [saved({ ann: [1, 1], ben: [0, 0], cat: [0, 0] })]
            )
        );
        fireEvent.click(dockButton('Enter the tricks'));
        expect(await screen.findByText('Every trick is in, 2 of 2.')).toBeTruthy();
        await heard(screenLine(), 'Enter the tricks for round 2. Every trick is in, 2 of 2.');
        fireEvent.click(screen.getByRole('button', { name: 'Change the bids' }));
        await waitFor(() => {
            expect(document.activeElement?.id).toBe('counts-line');
        });
        fireEvent.click(dockButton('Save the bids'));
        expect(
            await screen.findByRole('heading', { name: 'The bids, while the hand is played' })
        ).toBeTruthy();
    });

    it('saves a round once however quickly its button is pressed twice', async () => {
        const { open } = await draw(
            wizard(
                at(
                    { part: 'tricks', player: 'ann' },
                    {
                        entries: {
                            ann: { bid: 1, tricks: 1 },
                            ben: { bid: 0, tricks: 0 },
                            cat: { bid: 0, tricks: 0 },
                        },
                    }
                )
            )
        );
        const save = dockButton('Save the round');
        fireEvent.click(save);
        fireEvent.click(save);
        await waitFor(() => {
            expect(toast()?.textContent).toContain('Round 1 saved.');
        });
        const store = await open();
        const game = await store.game('g-1');
        store.close();
        expect(game?.rounds).toHaveLength(1);
        expect(game?.draft?.round['entries']).toEqual({});
        // The second press saved nothing, so nothing is refused over the round's summary.
        await new Promise((resolve) => {
            setTimeout(resolve, 300);
        });
        expect(screenLine().textContent).toBe('');
    });
});

afterEach(() => {
    vi.useRealTimers();
});
