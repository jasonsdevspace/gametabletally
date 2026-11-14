import type { ReactNode } from 'react';

import { Link } from './navigation.js';
import { type Route, ROUTES } from './routes.js';
import { About } from './website/About.js';
import { Install } from './website/Install.js';
import { Start } from './website/Start.js';
import { Website } from './website/Website.js';

/**
 * The screens, one for each address. The website's pages, the first visit, the install page and
 * the about page, are drawn in the website's frame. A screen for keeping score is a plain
 * page that holds its top heading, so every address has a heading to prerender and to focus. A screen about one thing
 * reads its id once it is running, never in the prerender, so the prerendered page holds the
 * frame and the heading and never the phone's own data.
 */

/**
 * A screen for keeping score: its main region, which focus moves to on arrival, and its one top
 * heading.
 */
export const Page = ({
    title,
    children,
}: {
    readonly title: string;
    readonly children?: ReactNode;
}) => (
    <main id="main" tabIndex={-1}>
        <h1>{title}</h1>
        {children}
    </main>
);

/** The screen at a route, or its plain page, so every address draws a heading. */
export const Screen = ({ route }: { readonly route: Route }) => {
    switch (route.name) {
        case 'start':
            return <Start />;
        case 'install':
            return <Install />;
        case 'about':
            return <About />;
        default:
            return <Page title={route.title} />;
    }
};

/** A page of the website that is not one of its addresses: its heading and its text. */
const Notice = ({ title, children }: { readonly title: string; readonly children: ReactNode }) => (
    <Website>
        <div className="gtt-page">
            <h1 className="gtt-display gtt-display-page">{title}</h1>
            {children}
        </div>
    </Website>
);

/** The page for an address that is not one, in the website's frame, with a way to the start. */
export const NotFound = () => (
    <Notice title="Nothing at this address">
        <p>The page might have moved, or the link might have a typo in it.</p>
        <p>
            <Link href={ROUTES[0].path}>Back to the start</Link>
        </p>
    </Notice>
);

/**
 * The page for a screen that failed, in the website's frame. Its way back is a plain link, which
 * loads the start afresh, since whatever failed may still be held in memory.
 */
export const ErrorPage = () => (
    <Notice title="Something went wrong">
        <p>
            This page could not be shown. Your saved games are still on this phone. Go back to the
            start and try again.
        </p>
        <p>
            <a href={ROUTES[0].path}>Back to the start</a>
        </p>
    </Notice>
);
