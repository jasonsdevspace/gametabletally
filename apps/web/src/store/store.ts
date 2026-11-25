import {
    compareInstants,
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
 * It is IndexedDB behind a few plain functions. Each one is a single transaction, reads and
 * writes together, so what it decides on is what it writes over, and a change is saved whole or
 * not at all. A page closed in the middle of a round leaves the game as it was after the last
 * entry.
 */

/** The database on the phone, and its stores, which the browser tests' seeding writes to too. */
export const DATABASE = 'gametabletally';
export const PLAYERS = 'players';
export const GAMES = 'games';

/**
 * The stores the database holds, each keyed by its records' id. Opening the database makes any
 * that are missing, here and in the browser tests' seeding, so the two never differ.
 */
export const SCHEMA = [
    { name: PLAYERS, keyPath: 'id' },
    { name: GAMES, keyPath: 'id' },
] as const;

/** What a page shows when the phone's games were saved by a newer build than this one. */
export const NEWER_DATABASE =
    'The games on this phone were saved by a newer version of the app. Update the app to open them.';

/** What a page shows when another tab of the app keeps a newer build from opening the games. */
export const BLOCKED_DATABASE =
    'Another tab of the app is open on an older version. Close it, then open the app again.';

/** How a newer build has the database: it refused this page, or closed the store under it. */
export type Newer = 'refused' | 'closed';

const hearing = new Set<(how: Newer) => void>();

/**
 * Hears each time a newer build has the database, refusing a page that opens it or closing a store
 * as it upgrades, so the app can offer that build or reload into it. Returns what stops hearing.
 */
export const hearNewer = (listener: (how: Newer) => void): (() => void) => {
    hearing.add(listener);
    return () => {
        hearing.delete(listener);
    };
};

const tell = (how: Newer) => {
    for (const listener of hearing) listener(how);
};

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

/**
 * Runs one piece of work as a single transaction over the kinds of record named, and ends when
 * it is saved. The work may read and then write, and nothing else can come between the two. If
 * it fails, nothing it wrote is kept.
 */
const within = async <Result>(
    database: IDBDatabase,
    names: readonly string[],
    mode: IDBTransactionMode,
    work: (transaction: IDBTransaction) => Promise<Result>
): Promise<Result> => {
    const transaction = database.transaction(names, mode);
    const done = finished(transaction);
    let result: Result;
    try {
        result = await work(transaction);
    } catch (error) {
        // The transaction may have failed already, in which case there is nothing left to stop.
        try {
            transaction.abort();
        } catch {
            // Already ended.
        }
        await done.catch(() => undefined);
        throw error;
    }
    await done;
    return result;
};

/** Every record of one kind as it sits in the database, read or not. */
const rows = (transaction: IDBTransaction, name: string): Promise<unknown[]> =>
    settled<unknown[]>(transaction.objectStore(name).getAll());

/** The records of one kind that are what they should be, and how many are not. */
const readRows = <Saved>(
    raw: readonly unknown[],
    read: (row: unknown) => Saved | null
): { readonly saved: Saved[]; readonly damaged: number } => {
    const saved = raw.flatMap((row) => read(row) ?? []);
    return { saved, damaged: raw.length - saved.length };
};

/** Whether a record in the games' store names a player, readable as a game or not. */
const names = (row: unknown, id: string): boolean =>
    typeof row === 'object' &&
    row !== null &&
    'players' in row &&
    Array.isArray(row.players) &&
    row.players.includes(id);

/** The order players are listed in: the order they were added. */
export const byAdded = (first: SavedPlayer, second: SavedPlayer): number =>
    compareInstants(first.added, second.added);

const lastChangedFirst = (first: SavedGame, second: SavedGame): number =>
    compareInstants(second.changed, first.changed);

/** How many records an import added or replaced. */
export interface Imported {
    readonly players: number;
    readonly games: number;
}

export interface Store {
    /** Every player, the removed ones among them, in the order they were added. */
    readonly players: () => Promise<readonly SavedPlayer[]>;
    /** Saves a player, new or changed. One that is not a player is refused and nothing is saved. */
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
    /**
     * Saves a game as it stands, which is how each entry is kept. One that is not a game is
     * refused and nothing is saved.
     */
    readonly saveGame: (game: SavedGame) => Promise<void>;
    readonly removeGame: (id: string) => Promise<void>;
    /**
     * How many records in the database are not a player or a game, and so are shown nowhere and
     * left out of an exported file. Above zero, a page should say a backup is not whole.
     */
    readonly damaged: () => Promise<number>;
    /** Everything saved that can be read, as one file, taken at one moment. */
    readonly exportFile: (exported: string) => Promise<SavedFile>;
    /**
     * Merges a file into what is saved, whole or not at all. A player or a game that is not
     * here is added. A game that is here is kept as whichever was changed later, so no game is
     * here twice, and a player who is here is kept as they are here.
     */
    readonly importFile: (file: SavedFile) => Promise<Imported>;
    readonly close: () => void;
    /**
     * Whether the store is closed, by its own `close` or by a newer build in another tab upgrading
     * the database, after which a page that keeps a store opens it afresh.
     */
    readonly closed: () => boolean;
}

const storeOver = (database: IDBDatabase): Store => {
    let closed = false;
    return {
        players: () =>
            within(database, [PLAYERS], 'readonly', async (transaction) =>
                readRows(await rows(transaction, PLAYERS), readPlayer).saved.sort(byAdded)
            ),
        games: () =>
            within(database, [GAMES], 'readonly', async (transaction) =>
                readRows(await rows(transaction, GAMES), readGame).saved.sort(lastChangedFirst)
            ),
        savePlayer: async (player) => {
            if (readPlayer(player) === null)
                throw new Error('This is not a player, so it was not saved.');
            await within(database, [PLAYERS], 'readwrite', (transaction) =>
                settled(transaction.objectStore(PLAYERS).put(player))
            );
        },
        removePlayer: (id) =>
            // The games are read in the transaction that removes the player, so a game saved in
            // between cannot name a player who is then deleted.
            within(database, [PLAYERS, GAMES], 'readwrite', async (transaction) => {
                const records = transaction.objectStore(PLAYERS);
                const row: unknown = await settled<unknown>(records.get(id));
                const player = readPlayer(row);
                const played = (await rows(transaction, GAMES)).some((game) => names(game, id));
                if (played && player) await settled(records.put({ ...player, removed: true }));
                else if (!played) await settled(records.delete(id));
            }),
        game: (id) =>
            within(database, [GAMES], 'readonly', async (transaction) => {
                const row: unknown = await settled<unknown>(transaction.objectStore(GAMES).get(id));
                return readGame(row);
            }),
        saveGame: async (game) => {
            if (readGame(game) === null)
                throw new Error('This is not a game, so it was not saved.');
            await within(database, [GAMES], 'readwrite', (transaction) =>
                settled(transaction.objectStore(GAMES).put(game))
            );
        },
        removeGame: (id) =>
            within(database, [GAMES], 'readwrite', (transaction) =>
                settled(transaction.objectStore(GAMES).delete(id))
            ),
        damaged: () =>
            within(database, [PLAYERS, GAMES], 'readonly', async (transaction) => {
                const players = readRows(await rows(transaction, PLAYERS), readPlayer);
                const games = readRows(await rows(transaction, GAMES), readGame);
                return players.damaged + games.damaged;
            }),
        exportFile: (exported) =>
            within(database, [PLAYERS, GAMES], 'readonly', async (transaction) => ({
                format: FORMAT,
                version: FORMAT_VERSION,
                exported,
                players: readRows(await rows(transaction, PLAYERS), readPlayer).saved.sort(byAdded),
                games: readRows(await rows(transaction, GAMES), readGame).saved.sort(
                    lastChangedFirst
                ),
            })),
        importFile: (file) =>
            // What is here is read in the transaction that writes, so an entry saved while a file is
            // being merged is weighed against the file's copy and never lost under it.
            within(database, [PLAYERS, GAMES], 'readwrite', async (transaction) => {
                const here = {
                    players: readRows(await rows(transaction, PLAYERS), readPlayer).saved,
                    games: readRows(await rows(transaction, GAMES), readGame).saved,
                };
                const known = new Set(here.players.map(({ id }) => id));
                const changedAt = new Map(here.games.map(({ id, changed }) => [id, changed]));
                const players = file.players.filter(({ id }) => !known.has(id));
                const games = file.games.filter(({ id, changed }) => {
                    const saved = changedAt.get(id);
                    return saved === undefined || compareInstants(changed, saved) > 0;
                });
                for (const player of players)
                    await settled(transaction.objectStore(PLAYERS).put(player));
                for (const game of games) await settled(transaction.objectStore(GAMES).put(game));
                return { players: players.length, games: games.length };
            }),
        close: () => {
            closed = true;
            database.close();
        },
        closed: () => closed,
    };
};

/**
 * Opens the phone's saved players and games, making the place for them on a first visit.
 *
 * The database's version is the saved shape's, so a later shape is brought in by the upgrade
 * that opening at the new version runs. A database a newer build has already upgraded is
 * refused with a sentence a page can show, as a newer file is. An open tab lets go of the
 * database when a newer build asks to upgrade it, and a build that is kept waiting by a tab
 * that does not says so, and closes the connection that opens once that tab lets go, since no
 * page is left listening to it and it would keep the next newer build waiting in turn.
 */
export const openStore = async (
    factory: IDBFactory = indexedDB,
    name: string = DATABASE,
    // The saved shape's version, which only a test of a later one passes.
    version: number = FORMAT_VERSION
): Promise<Store> => {
    const opening = factory.open(name, version);
    opening.onupgradeneeded = () => {
        const database = opening.result;
        for (const { name: kind, keyPath } of SCHEMA)
            if (!database.objectStoreNames.contains(kind))
                database.createObjectStore(kind, { keyPath });
    };
    let refused = false;
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
        opening.onsuccess = () => {
            if (refused) opening.result.close();
            else resolve(opening.result);
        };
        opening.onblocked = () => {
            refused = true;
            reject(new Error(BLOCKED_DATABASE));
        };
        opening.onerror = () => {
            const newer = opening.error?.name === 'VersionError';
            if (newer) tell('refused');
            reject(
                newer
                    ? new Error(NEWER_DATABASE)
                    : (opening.error ?? new Error('The saved games could not be opened.'))
            );
        };
    });
    const store = storeOver(database);
    database.onversionchange = () => {
        store.close();
        tell('closed');
    };
    return store;
};

/**
 * Opens the database for one piece of work and lets it go after, so a page left open while a newer
 * build upgrades the database, which closes every connection, opens it afresh the next time.
 */
export const withStore = async <Result>(
    open: () => Promise<Store>,
    work: (store: Store) => Promise<Result>
): Promise<Result> => {
    const store = await open();
    try {
        return await work(store);
    } finally {
        store.close();
    }
};

/** The store's own sentence for a database it would not open, or null for any other failure. */
export const refusalOf = (error: unknown): string | null =>
    error instanceof Error &&
    (error.message === NEWER_DATABASE || error.message === BLOCKED_DATABASE)
        ? error.message
        : null;

/** The browser's storage manager, or null in a browser that has none. */
const storageManager = (): StorageManager | null =>
    typeof navigator !== 'undefined' && 'storage' in navigator ? navigator.storage : null;

/**
 * Whether the browser has agreed to keep what the app has saved, without asking it to, or null
 * when the browser does not say.
 */
export const storageKept = async (
    storage: Pick<StorageManager, 'persisted'> | null = storageManager()
): Promise<boolean | null> => {
    if (!storage) return null;
    try {
        return await storage.persisted();
    } catch {
        return null;
    }
};

/**
 * Asks the browser to keep what the app has saved. A browser may clear a site's data when the
 * phone runs low, and passes over a site it has agreed to keep. Resolves to whether it has agreed.
 * A browser that has agreed already is not asked again, so a visitor who said yes is never asked
 * twice.
 */
export const keepStorage = async (
    storage: Pick<StorageManager, 'persist' | 'persisted'> | null = storageManager()
): Promise<boolean> => {
    if (!storage) return false;
    // A browser that will not say whether it agreed is asked all the same.
    if ((await storageKept(storage)) === true) return true;
    try {
        return await storage.persist();
    } catch {
        return false;
    }
};
