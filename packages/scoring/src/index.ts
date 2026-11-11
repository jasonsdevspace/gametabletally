/** A game the package knows, as an app lists it. */
export interface Game {
    /** What a saved game names it by. It never changes once a game has been saved under it. */
    readonly id: string;
    /** What a player calls it. Kept as data, so a name can change with no change to the code. */
    readonly name: string;
}

/** The games the package knows, in the order an app offers them. */
export const GAMES: readonly Game[] = [
    { id: 'flip-7', name: 'Flip 7' },
    { id: 'skyjo', name: 'Skyjo' },
    { id: 'wizard', name: 'Wizard' },
];
