import { Button } from '@jasonsdevspace/design-kit/react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';

import { readFile } from '../store/format.js';
import {
    BLOCKED_DATABASE,
    NEWER_DATABASE,
    openStore,
    storageKept,
    type Store,
} from '../store/store.js';
import { damagedOf, fileNameOf, keptOf, restoredOf, savedOf } from './backup-words.js';

/**
 * The about page's part on the games saved on the phone: whether the browser will keep them, a
 * button that saves every game to a file, and one that restores from a file. The buttons need the
 * page's script and the phone's database, so they are drawn once the database is open, and the
 * prerender holds a sentence for a browser with no script in their place.
 */

/** Hands the browser a file to save, as a download. */
export const download = (name: string, text: string): void => {
    const address = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = address;
    link.download = name;
    link.click();
    // The address is let go once the browser has surely started the download with it.
    setTimeout(() => {
        URL.revokeObjectURL(address);
    }, 60_000);
};

/** What the page says when the phone's database cannot be opened. */
const notOpened = (error: unknown): string =>
    error instanceof Error &&
    (error.message === NEWER_DATABASE || error.message === BLOCKED_DATABASE)
        ? error.message
        : 'Your games could not be opened in this browser.';

interface Opened {
    readonly store: Store;
    readonly kept: boolean | null;
    readonly damaged: number;
}

export interface BackupProps {
    /** Opens the phone's database, which a test opens in memory. */
    readonly open?: () => Promise<Store>;
    /** Whether the browser has agreed to keep what is saved. */
    readonly kept?: () => Promise<boolean | null>;
    readonly now?: () => Date;
    /** Hands the browser the saved file. */
    readonly save?: (name: string, text: string) => void;
}

const today = () => new Date();

export const Backup = ({
    open = openStore,
    kept = storageKept,
    now = today,
    save = download,
}: BackupProps) => {
    const [opened, setOpened] = useState<Opened | null>(null);
    const [said, setSaid] = useState('');
    const [busy, setBusy] = useState(false);
    const picker = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Set when the page has left, so an answer that comes later is not drawn.
        let left = false;
        const here = () => !left;
        let store: Store | undefined;
        void (async () => {
            try {
                store = await open();
                // A page left while the database opened lets it go at once.
                if (!here()) {
                    store.close();
                    return;
                }
                const [agreed, damaged] = await Promise.all([kept(), store.damaged()]);
                if (here()) setOpened({ store, kept: agreed, damaged });
            } catch (error) {
                if (here()) setSaid(notOpened(error));
            }
        })();
        return () => {
            left = true;
            store?.close();
        };
    }, [open, kept]);

    /** Runs one save or restore at a time, and says what it did or why it could not. */
    const run = async (work: (store: Store) => Promise<string>, failed: string) => {
        if (!opened || busy) return;
        setBusy(true);
        try {
            setSaid(await work(opened.store));
        } catch {
            setSaid(failed);
        } finally {
            setBusy(false);
        }
    };

    const saveAll = () =>
        run(async (store) => {
            const when = now();
            const file = await store.exportFile(when.toISOString());
            const name = fileNameOf(when);
            save(name, JSON.stringify(file, null, 2));
            return savedOf(file.games.length, name);
        }, 'Your games could not be saved to a file. Try again.');

    const restore = (event: ChangeEvent<HTMLInputElement>) => {
        const chosen = event.currentTarget.files?.[0];
        // Emptied, so the same file can be chosen again.
        event.currentTarget.value = '';
        if (!chosen) return;
        void run(async (store) => {
            const file = readFile(await chosen.text());
            if ('code' in file) return file.message;
            return restoredOf(await store.importFile(file));
        }, 'The file could not be restored, and nothing saved has changed. Try again.');
    };

    return (
        <section aria-labelledby="saved">
            <h2 id="saved">Your games</h2>
            <p>
                Your games are kept in this browser on this phone, and nowhere else. Save them to a
                file to keep a copy, or to move them to another phone or browser and restore them
                there.
            </p>
            {opened ? (
                <>
                    <p>{keptOf(opened.kept)}</p>
                    {opened.damaged > 0 ? <p>{damagedOf(opened.damaged)}</p> : null}
                    <p className="dk-actions">
                        <Button off={busy} onClick={() => void saveAll()}>
                            Save to a file
                        </Button>
                        <Button
                            off={busy}
                            onClick={() => {
                                if (!busy) picker.current?.click();
                            }}
                        >
                            Restore from a file
                        </Button>
                    </p>
                    <input
                        ref={picker}
                        type="file"
                        accept="application/json,.json"
                        hidden
                        onChange={restore}
                    />
                </>
            ) : null}
            <noscript>
                <p>Turn on JavaScript to save your games to a file or restore them.</p>
            </noscript>
            <p className="gtt-status" role="status">
                {said}
            </p>
        </section>
    );
};
