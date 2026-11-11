import {
    FORMAT,
    FORMAT_VERSION,
    readGame,
    readPlayer,
    type SavedFile,
    type SavedGame,
    type SavedPlayer,
} from './format.js';

/**
 * Where players and games are kept on the phone: the one module the rest of the app calls.
 *
 * It is IndexedDB behind a few plain functions. A change is one transaction, so it is saved
 * whole or not at all, and a page closed in the middle of a round leaves the game as it was
 * after the last entry.
 */

const DATABASE = 'gametabletally';
const PLAYERS = 'players';
const GAMES = 'games';

/** A request's result, once it has one. */
const settled = <Result>(request: IDBRequest<Result>): Promise<Result> =>
    new Promise((resolve, reject) => {
        request.onsuccess = () => {
            resolve(request.result);
        };
        request.onerror = () => {
            reject(request.error ?? new Error('The saved games could not be read.'));
        };
    });

/** A transaction's end: saved whole, or not at all. */
const finished = (transaction: IDBTransaction): Promise<void> =>
    new Promise((resolve, reject) => {
        const failed = () => {
            reject(transaction.error ?? new Error('The change was not saved.'));
        };
        transaction.oncomplete = () => {
            resolve();
        };
        transaction.onabort = failed;
        transaction.onerror = failed;
    });

/** How many records an import added or replaced. */
export interface Imported {
    readonly players: number;
    readonly games: number;
}

export interface Store {
    /** Every player, the removed ones among them, in the order they were added. */
    readonly players: () => Promise<readonly SavedPlayer[]>;
    /** Saves a player, new or changed. */
    readonly savePlayer: (player: SavedPlayer) => Promise<void>;
    /**
     * Removes a player. One who has played is kept and marked as removed, so their games still
     * say who played. One who never played is deleted.
     */
    readonly removePlayer: (id: string) => Promise<void>;
    /** Every game, the last changed first. */
    readonly games: () => Promise<readonly SavedGame[]>;
    /** One game, or null when there is none with the id. */
    readonly game: (id: string) => Promise<SavedGame | null>;
    /** Saves a game as it stands, which is how each entry is kept. */
    readonly saveGame: (game: SavedGame) => Promise<void>;
    readonly removeGame: (id: string) => Promise<void>;
    /** Everything saved, as one file. */
    readonly exportFile: (exported: string) => Promise<SavedFile>;
    /**
     * Merges a file into what is saved, whole or not at all. A player or a game that is not
     * here is added. A game that is here is kept as whichever was changed later, so no game is
     * here twice, and a player who is here keeps the name they have here.
     */
    readonly importFile: (file: SavedFile) => Promise<Imported>;
    readonly close: () => void;
}

/** Every record of one kind, read, with any that is not of the kind passed over. */
const all = async <Saved>(
    database: IDBDatabase,
    name: string,
    read: (raw: unknown) => Saved | null
): Promise<Saved[]> => {
    const rows: unknown[] = await settled(
        database.transaction(name, 'readonly').objectStore(name).getAll()
    );
    return rows.flatMap((row) => read(row) ?? []);
};

/** Runs one change to the records of the kinds named, and ends when it is saved. */
const change = async <Result>(
    database: IDBDatabase,
    names: readonly string[],
    run: (transaction: IDBTransaction) => Result
): Promise<Result> => {
    const transaction = database.transaction(names, 'readwrite');
    const done = finished(transaction);
    let result: Result;
    try {
        result = run(transaction);
    } catch (error) {
        transaction.abort();
        await done.catch(() => undefined);
        throw error;
    }
    await done;
    return result;
};

const byAdded = (first: SavedPlayer, second: SavedPlayer): number =>
    first.added.localeCompare(second.added);

const byChanged = (first: SavedGame, second: SavedGame): number =>
    second.changed.localeCompare(first.changed);

const storeOver = (database: IDBDatabase): Store => {
    const players = async () => (await all(database, PLAYERS, readPlayer)).sort(byAdded);
    const games = async () => (await all(database, GAMES, readGame)).sort(byChanged);

    return {
        players,
        games,
        savePlayer: (player) =>
            change(database, [PLAYERS], (transaction) => {
                transaction.objectStore(PLAYERS).put(player);
            }),
        removePlayer: async (id) => {
            const [saved, played] = await Promise.all([players(), games()]);
            const player = saved.find((candidate) => candidate.id === id);
            if (!player) return;
            const hasPlayed = played.some((game) => game.players.includes(id));
            await change(database, [PLAYERS], (transaction) => {
                const records = transaction.objectStore(PLAYERS);
                if (hasPlayed) records.put({ ...player, removed: true });
                else records.delete(id);
            });
        },
        game: async (id) => {
            const row: unknown = await settled(
                database.transaction(GAMES, 'readonly').objectStore(GAMES).get(id)
            );
            return readGame(row);
        },
        saveGame: (game) =>
            change(database, [GAMES], (transaction) => {
                transaction.objectStore(GAMES).put(game);
            }),
        removeGame: (id) =>
            change(database, [GAMES], (transaction) => {
                transaction.objectStore(GAMES).delete(id);
            }),
        exportFile: async (exported) => ({
            format: FORMAT,
            version: FORMAT_VERSION,
            exported,
            players: await players(),
            games: await games(),
        }),
        importFile: async (file) => {
            const [savedPlayers, savedGames] = await Promise.all([players(), games()]);
            const known = new Set(savedPlayers.map(({ id }) => id));
            const changedAt = new Map(savedGames.map(({ id, changed }) => [id, changed]));
            const newPlayers = file.players.filter(({ id }) => !known.has(id));
            const newGames = file.games.filter(({ id, changed }) => {
                const here = changedAt.get(id);
                return here === undefined || changed > here;
            });
            await change(database, [PLAYERS, GAMES], (transaction) => {
                for (const player of newPlayers) transaction.objectStore(PLAYERS).put(player);
                for (const game of newGames) transaction.objectStore(GAMES).put(game);
            });
            return { players: newPlayers.length, games: newGames.length };
        },
        close: () => {
            database.close();
        },
    };
};

/**
 * Opens the phone's saved players and games, making the place for them on a first visit.
 *
 * The database's version is the saved shape's, so a later shape is brought in by the upgrade
 * that opening at the new version runs.
 */
export const openStore = async (
    factory: IDBFactory = indexedDB,
    name: string = DATABASE
): Promise<Store> => {
    const opening = factory.open(name, FORMAT_VERSION);
    opening.onupgradeneeded = () => {
        const database = opening.result;
        for (const kind of [PLAYERS, GAMES])
            if (!database.objectStoreNames.contains(kind))
                database.createObjectStore(kind, { keyPath: 'id' });
    };
    return storeOver(await settled(opening));
};

/**
 * Asks the browser to keep what the app has saved. A browser may clear a site's data when the
 * phone runs low, and a site that has asked is passed over. Whether it agreed.
 */
export const keepStorage = async (
    storage: Pick<StorageManager, 'persist'> | null = 'storage' in navigator
        ? navigator.storage
        : null
): Promise<boolean> => {
    if (!storage) return false;
    try {
        return await storage.persist();
    } catch {
        return false;
    }
};
