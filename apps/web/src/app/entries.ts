import { loader } from '../loader.js';
import { fetchScreen } from '../screens.js';

/**
 * Each game's round entry, a file of its own loaded for a game of that kind alone, since a table
 * plays one game at a time: Flip 7's cards, Skyjo's pad and Wizard's bids.
 */
export const ENTRIES = {
    'flip-7': loader(() => import('./flip7-round.js')),
    skyjo: loader(() => import('./skyjo-round.js')),
    wizard: loader(() => import('./wizard-round.js')),
};

/** The games this phone can enter a round of. */
type Entered = keyof typeof ENTRIES;

const isEntered = (game: string): game is Entered => Object.hasOwn(ENTRIES, game);

/**
 * Fetches what a game moves between as it is opened: the game's screen, its round entry and the
 * scores, so a move during the game never waits on the network.
 */
export const fetchGameAhead = (game: string): void => {
    fetchScreen('game');
    fetchScreen('scores');
    if (isEntered(game)) ENTRIES[game].prefetch();
};
