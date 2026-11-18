import type { ReactNode } from 'react';

import { GameScreen } from './app/GameScreen.js';
import { NewGame } from './app/NewGame.js';
import { PlayerPage } from './app/PlayerPage.js';
import { PlayersList } from './app/PlayersList.js';
import { PlayStart } from './app/PlayStart.js';
import { ScoresScreen } from './app/ScoresScreen.js';
import { Link } from './navigation.js';
import { hrefOf, type Route, ROUTES } from './routes.js';
import { About } from './website/About.js';
import { Install } from './website/Install.js';
import { Start } from './website/Start.js';
import { Website } from './website/Website.js';

/**
 * The screens, one for each address. The website's pages, the first visit, the install page and
 * the about page, are drawn in the website's frame. A screen for keeping score is drawn in the
 * app's frame, with its name in the frame's bar as its one top heading, so every address has a
 * heading to prerender and to focus. A screen about one thing reads its id once it is running,
 * never in the prerender, so the prerendered page holds the frame and the heading and never the
 * phone's own data.
 */

/**
 * What a screen for keeping score holds, inside the app's frame, which the app draws around it. A
 * screen with nothing of its own holds nothing, and the frame's bar names it.
 */
export const AppScreen = ({ route }: { readonly route: Route }) => {
    switch (route.name) {
        case 'play':
            return <PlayStart />;
        case 'new':
            return <NewGame />;
        case 'game':
            return <GameScreen />;
        case 'scores':
            return <ScoresScreen />;
        case 'players':
            return <PlayersList />;
        case 'player':
            return <PlayerPage />;
        default:
            return null;
    }
};

/** The website's pages at their routes, each drawing its own frame. */
export const Screen = ({ route }: { readonly route: Route }) => {
    switch (route.name) {
        case 'install':
            return <Install />;
        case 'about':
            return <About />;
        default:
            return <Start />;
    }
};

/**
 * What a screen for keeping score that failed shows in the frame's body. Its way back is a plain
 * link, which loads the start screen afresh, since whatever failed may still be held in memory.
 */
export const ScreenFailed = () => (
    <>
        <p>This screen could not be shown. Your saved games are still on this phone.</p>
        <p>
            <a href={hrefOf('play')}>Back to the start screen</a>
        </p>
    </>
);

/** A page of the website that is not one of its addresses: its heading and its text. */
const Notice = ({
    title,
    reload = false,
    children,
}: {
    readonly title: string;
    readonly reload?: boolean;
    readonly children: ReactNode;
}) => (
    <Website reload={reload}>
        <div className="dk-page gtt-page">
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
    <Notice title="Something went wrong" reload>
        <p>
            This page could not be shown. Your saved games are still on this phone. Go back to the
            start and try again.
        </p>
        <p>
            <a href={ROUTES[0].path}>Back to the start</a>
        </p>
    </Notice>
);
