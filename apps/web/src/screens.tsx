import { GAMES } from '@gametabletally/scoring';
import type { ReactNode } from 'react';

import { Link } from './navigation.js';
import { type Route, type RouteName, ROUTES } from './routes.js';

/**
 * The screens, one for each address. Each is a plain page that holds its top heading and nothing
 * drawn, so each screen's own piece fills it in, and no look is written that the design kit will
 * replace. A screen about one thing reads its id once it is running, never in the prerender, so
 * the prerendered page holds the frame and the heading and never the phone's own data.
 */

/** A page: its main region, which the skip to content lands on, and its one top heading. */
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

/** The start: the games the app keeps score for, by name. */
const Start = () => (
    <Page title={ROUTES[0].title}>
        <h2 id="games">Games</h2>
        <ul aria-labelledby="games">
            {GAMES.map((game) => (
                <li key={game.id}>{game.name}</li>
            ))}
        </ul>
    </Page>
);

/** The screen for each address. A screen not written yet is its plain page. */
const SCREENS: Partial<Record<RouteName, () => ReactNode>> = { start: Start };

/** Whether a name is one of a screen with its own drawing. */
const drawnFor = (name: string): (() => ReactNode) | undefined =>
    Object.entries(SCREENS).find(([key]) => key === name)?.[1];

/** The screen at a route. */
export const Screen = ({ route }: { readonly route: Route }) => {
    // Called rather than drawn as an element, since the screen is chosen as the app draws.
    return drawnFor(route.name)?.() ?? <Page title={route.title} />;
};

/** The page for an address that is not one, with a way to the start. */
export const NotFound = () => (
    <Page title="Nothing at this address">
        <p>The page might have moved, or the link might have a typo in it.</p>
        <p>
            <Link href={ROUTES[0].path}>Back to the start</Link>
        </p>
    </Page>
);

/**
 * The page for a screen that failed. Its way back is a plain link, which loads the start afresh,
 * since whatever failed may still be held in memory.
 */
export const ErrorPage = () => (
    <Page title="Something went wrong">
        <p>The screen could not be shown. What was saved is still saved.</p>
        <p>
            <a href={ROUTES[0].path}>Back to the start</a>
        </p>
    </Page>
);
