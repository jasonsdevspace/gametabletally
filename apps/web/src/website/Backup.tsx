import { Button } from '@jasonsdevspace/design-kit/react';
import { type ChangeEvent, useEffect, useRef, useState } from 'react';

import { readFile } from '../store/format.js';
import { openStore, refusalOf, storageKept, type Store, withStore } from '../store/store.js';
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
    // Let go a minute later rather than at once, since a browser that starts the download after
    // the click returns would find the address gone.
    setTimeout(() => {
        URL.revokeObjectURL(address);
    }, 60_000);
};

/** What the page says when the phone's database cannot be opened. */
const notOpened = (error: unknown): string =>
    refusalOf(error) ??
    'Your games could not be opened in this browser. Reload the page to try again.';

/** What the page knows once the database has opened: the browser's answer and what is unreadable. */
interface Ready {
    readonly kept: boolean | null;
    readonly damaged: number;
}

export interface BackupProps {
    /** Opens the phone's database, which a test opens in memory. */
    readonly open?: () => Promise<Store>;
    /**
     * Whether the browser has agreed to keep what is saved, read without asking, or null when it
     * does not say.
     */
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
    const [ready, setReady] = useState<Ready | null>(null);
    const [said, setSaid] = useState('');
    const [busy, setBusy] = useState(false);
    const picker = useRef<HTMLInputElement>(null);

    useEffect(() => {
        // Set when the page has left, so an answer that comes later is not drawn.
        let left = false;
        const here = () => !left;
        void (async () => {
            try {
                // A count that cannot be read leaves the buttons in place, since a backup is
                // wanted most when something is wrong.
                const damaged = await withStore(open, (store) => store.damaged().catch(() => 0));
                const agreed = await kept().catch(() => null);
                if (here()) setReady({ kept: agreed, damaged });
            } catch (error) {
                if (here()) setSaid(notOpened(error));
            }
        })();
        return () => {
            left = true;
        };
    }, [open, kept]);

    /** Runs one save or restore at a time, and says what it did or why it could not. */
    const run = async (work: (store: Store) => Promise<string>, failed: string) => {
        if (busy) return;
        setBusy(true);
        // Emptied first, so the same sentence said twice is heard twice.
        setSaid('');
        try {
            setSaid(await withStore(open, work));
        } catch (error) {
            setSaid(refusalOf(error) ?? failed);
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
        }, 'The file could not be restored, so nothing changed. Try again.');
    };

    return (
        <section aria-labelledby="saved">
            <h2 id="saved">Your games</h2>
            <p>
                Your games are kept in this browser and nowhere else. Save them to a file to keep a
                copy, or to move them to another phone or browser and restore them there.
            </p>
            {ready ? (
                <>
                    <p>{keptOf(ready.kept)}</p>
                    {ready.damaged > 0 ? <p>{damagedOf(ready.damaged)}</p> : null}
                    <p className="dk-actions">
                        <Button off={busy} onClick={() => void saveAll()}>
                            Save to a file
                        </Button>
                        <Button
                            off={busy}
                            onClick={() => {
                                picker.current?.click();
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
