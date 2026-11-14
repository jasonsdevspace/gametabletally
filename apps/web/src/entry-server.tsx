import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';

import { App } from './App.js';
import { drawAt } from './navigation.js';
import { NOT_FOUND_FILE, ROUTES, titleOf } from './routes.js';

/**
 * Each page as the build writes it, drawn ahead of time so it reads with no script. The client
 * build writes one empty page, and the prerender script fills a copy of it for each address.
 */

export interface Prerendered {
    /** Where the page is written, relative to the build's folder. */
    readonly file: string;
    readonly title: string;
    readonly markup: string;
}

const draw = (path: string): string => {
    drawAt({ path, search: '' });
    return renderToString(
        <StrictMode>
            <App />
        </StrictMode>
    );
};

/** Every page the build writes: one for each address, and the not-found page. */
export const prerender = (): Prerendered[] => [
    ...ROUTES.map((route) => ({
        file: route.path === '/' ? 'index.html' : `${route.path.slice(1)}index.html`,
        title: titleOf(route.title),
        markup: draw(route.path),
    })),
    {
        file: NOT_FOUND_FILE,
        title: titleOf('Nothing at this address'),
        markup: draw(`/${NOT_FOUND_FILE}`),
    },
];
