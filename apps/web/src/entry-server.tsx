import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';

import { App } from './App.js';
import { drawAt } from './navigation.js';
import { NOT_FOUND_FILE, ROUTES, titleOf } from './routes.js';
import { filesAt, loadEveryScreen } from './screens.js';

/**
 * Each page as the build writes it, drawn ahead of time so it reads with no script. The client
 * build writes one empty page, and the prerender script fills a copy of it for each address.
 */

export interface Prerendered {
    /** Where the page is written, relative to the build's folder. */
    readonly file: string;
    readonly title: string;
    readonly markup: string;
    /** The source files of the page's own code, whose built files the page fetches beside the shell. */
    readonly files: readonly string[];
}

const draw = (path: string): string => {
    drawAt({ path, search: '' });
    return renderToString(
        <StrictMode>
            <App />
        </StrictMode>
    );
};

/**
 * Every page the build writes: one for each address, and the not-found page. Every screen's code is
 * loaded first, so each page is drawn whole rather than with its loading line.
 */
export const prerender = async (): Promise<Prerendered[]> => {
    await loadEveryScreen();
    return [
        ...ROUTES.map((route) => ({
            file: route.path === '/' ? 'index.html' : `${route.path.slice(1)}index.html`,
            title: titleOf(route.title),
            markup: draw(route.path),
            files: filesAt(route),
        })),
        {
            file: NOT_FOUND_FILE,
            title: titleOf('Nothing at this address'),
            markup: draw(`/${NOT_FOUND_FILE}`),
            files: [],
        },
    ];
};
