import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { IDBFactory } from 'fake-indexeddb';

import { openPlay } from '../src/play/play.js';
import { FORMAT_VERSION, type SavedGame } from '../src/store/format.js';
import { DATABASE, GAMES, openStore, PLAYERS } from '../src/store/store.js';

/*
 * What the browser tests share: the test itself, an axe audit that names what it found, a check
 * of every control's target size, and a way to seed the browser's database with a game built by
 * the app's own model, so a test of a later screen starts where it needs to.
 */

export { expect, test };
export type { Page };

/** Waits for the page's fonts, so nothing is measured before its text has its final size. */
export const fontsReady = (page: Page): Promise<unknown> =>
    page.evaluate(() => document.fonts.ready);

/**
 * Audits the page as it stands with axe, and fails naming each rule broken and the elements that
 * break it.
 */
export const audit = async (page: Page): Promise<void> => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(
        results.violations.map(
            (violation) =>
                `${violation.id}: ${violation.nodes.map((node) => node.target.join(' ')).join(', ')}`
        )
    ).toEqual([]);
};

/** The least a control's target may measure, in CSS pixels, by WCAG 2.5.8. */
const TARGET = 24;

/**
 * Every control on the page that misses WCAG 2.5.8's target size: one under 24 by 24 pixels
 * whose 24 pixel circle, around its center, meets another control's, and that is not a link
 * within a sentence. Each is named by its text, so a failure says which.
 */
export const smallTargets = async (page: Page): Promise<string[]> => {
    await fontsReady(page);
    return page.evaluate((least) => {
        const controls = [
            ...document.querySelectorAll<HTMLElement>(
                'a[href], button, input, select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])'
            ),
        ].filter((control) => control.getClientRects().length > 0);
        const boxes = controls.map((control) => control.getBoundingClientRect());
        const centers = boxes.map(
            (box) => [box.x + box.width / 2, box.y + box.height / 2] as const
        );
        /** Whether a link sits within a sentence, which WCAG leaves out of the rule. */
        const inSentence = (control: HTMLElement) =>
            control.tagName === 'A' &&
            (control.parentElement?.textContent ?? '').trim() !== control.textContent.trim();
        return controls.flatMap((control, at) => {
            const box = boxes[at];
            const center = centers[at];
            if (!box || !center) return [];
            if (box.width >= least && box.height >= least) return [];
            if (inSentence(control)) return [];
            const crowded = centers.some(
                (other, near) =>
                    near !== at && Math.hypot(other[0] - center[0], other[1] - center[1]) < least
            );
            return crowded ? [(control.textContent || control.outerHTML).trim().slice(0, 40)] : [];
        });
    }, TARGET);
};

/** A clock that moves on a second at each reading from a fixed start, so a seeded game's dates are fixed. */
const fixedClock = () => {
    let at = Date.parse('2026-11-14T10:00:00Z');
    return () => {
        at += 1000;
        return new Date(at).toISOString();
    };
};

/**
 * A game built by the app's own model, as the steps given leave it: a new game is started and
 * handed to `play`, which drives it, and what the model saved is returned.
 */
export const buildGame = async (
    game: Parameters<ReturnType<typeof openPlay>['start']>[0],
    play: (model: ReturnType<typeof openPlay>) => Promise<void> = () => Promise.resolve()
): Promise<SavedGame> => {
    const store = await openStore(new IDBFactory(), 'seed');
    const model = openPlay(store, fixedClock());
    await model.start(game);
    await play(model);
    const built = await store.game(game.id);
    store.close();
    if (!built) throw new Error(`The model saved no game ${game.id}.`);
    return built;
};

/**
 * Writes games into the browser's database for the page's origin, as the app's store keeps them,
 * making the database first where the app has not yet. The page has to be on the app's origin.
 */
export const seed = async (page: Page, games: readonly SavedGame[]): Promise<void> => {
    await page.evaluate(
        ({ name, version, players, stores, records }) =>
            new Promise<void>((resolve, reject) => {
                const opening = indexedDB.open(name, version);
                opening.onupgradeneeded = () => {
                    for (const kind of [players, stores])
                        if (!opening.result.objectStoreNames.contains(kind))
                            opening.result.createObjectStore(kind, { keyPath: 'id' });
                };
                opening.onerror = () => {
                    reject(opening.error ?? new Error('The database could not be opened.'));
                };
                opening.onsuccess = () => {
                    const database = opening.result;
                    const writing = database.transaction(stores, 'readwrite');
                    for (const record of records) writing.objectStore(stores).put(record);
                    writing.oncomplete = () => {
                        database.close();
                        resolve();
                    };
                    writing.onerror = () => {
                        reject(writing.error ?? new Error('The games were not seeded.'));
                    };
                };
            }),
        { name: DATABASE, version: FORMAT_VERSION, players: PLAYERS, stores: GAMES, records: games }
    );
};
