import type { Game } from '@gametabletally/scoring';

/**
 * What the website says about each game beside its name: a line about how it plays and the
 * mark drawn faintly on its tile. The names come from the scoring package, so a renamed game is
 * renamed here with no change.
 */
export interface GameCard {
    /** A short line about how the game plays. */
    readonly line: string;
    /** A mark drawn large and faint on the tile, hidden from a screen reader. */
    readonly mark: string;
}

const CARDS: Readonly<Record<string, GameCard>> = {
    'flip-7': { line: 'A little luck and a lot of nerve.', mark: '7' },
    skyjo: { line: 'The lowest score wins, every round.', mark: '−2' },
    wizard: { line: 'Call your tricks, then take them.', mark: '✦' },
};

/**
 * What the website says about a game, or a plain card, so a game added to the scoring package
 * still gets a tile.
 */
export const cardOf = (id: string): GameCard => CARDS[id] ?? { line: '', mark: '' };

/** Whether the website has words for a game. */
export const hasCard = (id: string): boolean => id in CARDS;

/** How many play a game, in words: "2 to 8 players", or "3 or more players" with no limit. */
export const playersOf = ({ minPlayers, maxPlayers }: Pick<Game, 'minPlayers' | 'maxPlayers'>) =>
    maxPlayers === null
        ? `${minPlayers} or more players`
        : `${minPlayers} to ${maxPlayers} players`;

/** Names in a list joined by a word, as "Flip 7, Skyjo or Wizard". */
export const listOf = (names: readonly string[], word: 'and' | 'or'): string =>
    names.length <= 1
        ? (names[0] ?? '')
        : `${names.slice(0, -1).join(', ')} ${word} ${names.at(-1) ?? ''}`;
