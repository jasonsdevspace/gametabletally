import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { IDBFactory } from 'fake-indexeddb';

import { openPlay } from '../src/play/play.js';
import { FORMAT_VERSION, type SavedGame, type SavedPlayer } from '../src/store/format.js';
import { DATABASE, GAMES, openStore, PLAYERS, SCHEMA } from '../src/store/store.js';

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
    // Contrast for large text depends on its size, so the fonts are in before axe measures.
    await fontsReady(page);
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
 * Every control on the page that misses WCAG 2.5.8's target size, each named by its text, so a
 * failure says which. A control passes when it is at least 24 by 24 pixels. One smaller passes
 * when a circle 24 pixels across, around its center, meets no other control and no other small
 * control's circle. A region that takes focus only to scroll, such as the frame's body, is left
 * out when it holds controls, since it holds them rather than standing beside them. A link set
 * inline within a sentence is left out, as the rule leaves it, and so is a control drawn at a
 * single pixel until it has focus, such as a skip link.
 */
export const smallTargets = async (page: Page): Promise<string[]> => {
    await fontsReady(page);
    return page.evaluate((least) => {
        const controls = [
            ...document.querySelectorAll<HTMLElement>(
                'a[href], button, input, select, textarea, summary, [role="button"], [tabindex]:not([tabindex="-1"])'
            ),
        ].filter((control) => {
            // A region that takes focus only so it can be scrolled, such as the frame's body,
            // holds controls rather than being one beside them.
            if (
                !control.matches(
                    'a[href], button, input, select, textarea, summary, [role="button"]'
                ) &&
                control.querySelector('a[href], button, input, select, textarea, summary')
            )
                return false;
            const box = control.getBoundingClientRect();
            return control.getClientRects().length > 0 && box.width > 1 && box.height > 1;
        });
        const boxes = controls.map((control) => control.getBoundingClientRect());
        const centers = boxes.map(
            (box) => [box.x + box.width / 2, box.y + box.height / 2] as const
        );
        const small = boxes.map((box) => box.width < least || box.height < least);
        /** How far a point is from the nearest edge of a box, nothing when it is inside. */
        const gap = (box: DOMRect, x: number, y: number) =>
            Math.hypot(
                Math.max(box.left - x, 0, x - box.right),
                Math.max(box.top - y, 0, y - box.bottom)
            );
        /** Whether a link is set inline among the words of a sentence. */
        const inSentence = (control: HTMLElement) =>
            control.tagName === 'A' &&
            getComputedStyle(control).display === 'inline' &&
            [...(control.parentElement?.childNodes ?? [])].some(
                (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== ''
            );
        return controls.flatMap((control, at) => {
            const center = centers[at];
            if (!center || !small[at] || inSentence(control)) return [];
            const [x, y] = center;
            const crowded = boxes.some((other, near) => {
                if (near === at) return false;
                if (gap(other, x, y) < least / 2) return true;
                const [ox, oy] = centers[near] ?? [Number.NaN, Number.NaN];
                return small[near] === true && Math.hypot(ox - x, oy - y) < least;
            });
            return crowded ? [(control.textContent || control.outerHTML).trim().slice(0, 40)] : [];
        });
    }, TARGET);
};

/**
 * A clock that moves on a second at each reading from a fixed start, so a seeded game's dates are
 * fixed.
 */
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
 * Writes games, and the players they name, into the browser's database for the page's origin, as
 * the app's store keeps them, making the database first where the app has not yet. The page has
 * to be on the app's origin.
 */
export const seed = async (
    page: Page,
    games: readonly SavedGame[],
    players: readonly SavedPlayer[] = []
): Promise<void> => {
    await page.evaluate(
        ({ name, version, schema, records }) =>
            new Promise<void>((resolve, reject) => {
                const opening = indexedDB.open(name, version);
                opening.onupgradeneeded = () => {
                    // The app's own schema, so a database seeded first is the one the app makes.
                    for (const { name: kind, keyPath } of schema)
                        if (!opening.result.objectStoreNames.contains(kind))
                            opening.result.createObjectStore(kind, { keyPath });
                };
                opening.onerror = () => {
                    reject(opening.error ?? new Error('The database could not be opened.'));
                };
                opening.onsuccess = () => {
                    const database = opening.result;
                    const writing = database.transaction(
                        records.map(([kind]) => kind),
                        'readwrite'
                    );
                    for (const [kind, rows] of records)
                        for (const row of rows) writing.objectStore(kind).put(row);
                    writing.oncomplete = () => {
                        database.close();
                        resolve();
                    };
                    writing.onerror = () => {
                        reject(
                            writing.error ?? new Error('The games and players were not seeded.')
                        );
                    };
                };
            }),
        {
            name: DATABASE,
            version: FORMAT_VERSION,
            schema: SCHEMA,
            records: [
                [GAMES, games],
                [PLAYERS, players],
            ] as const,
        }
    );
};
