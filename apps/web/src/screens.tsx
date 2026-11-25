import { type ReactNode, use } from 'react';

import type { AppFrame } from './app/AppFrame.js';
import { type Loader, loader } from './loader.js';
import { Link } from './navigation.js';
import { FRAME_FILE, SCREEN_FILES } from './own-files.js';
import { hrefOf, inApp, type Route, type RouteName, ROUTES, SECTION_OF } from './routes.js';
import { Website } from './website/Website.js';

/**
 * The screens, one for each address. The website's pages, the first visit, the install page and
 * the about page, are drawn in the website's frame. A screen for keeping score is drawn in the
 * app's frame, with its name in the frame's bar as its one top heading, so every address has a
 * heading to prerender and to focus. A screen about one thing reads its id once it is running,
 * never in the prerender, so the prerendered page holds the frame and the heading and never the
 * phone's own data.
 *
 * Each screen's code is a file of its own, loaded the first time the screen is opened, so a page
 * sends only the shell and the screen it shows. The app's frame is loaded with the app's first
 * screen, so the website's pages send none of the app. Every screen is imported here by `import()`
 * alone, which a test holds. The build marks the files of a page's own code to fetch beside the
 * shell, from the source files named here. The service worker fetches every other file once the
 * first page has loaded, and serves them from then on, so a move never waits on the network and a
 * screen opened with no connection draws at once.
 */

/**
 * A screen's code: the source file the build names it by, and its loader, which gives what draws
 * the screen. It draws by calling it, so the screen's component is the module's own, the same on
 * every draw.
 */
interface ScreenCode<T = () => ReactNode> {
    readonly file: string;
    readonly code: Loader<T>;
}

/** What the app's frame takes. */
type FrameProps = Parameters<typeof AppFrame>[0];

const screen = <T = () => ReactNode,>(file: string, load: () => Promise<T>): ScreenCode<T> => ({
    file,
    code: loader(load),
});

/** The app's frame, around every screen for keeping score. */
export const FRAME = screen(FRAME_FILE, () =>
    import('./app/AppFrame.js').then((m) => (props: FrameProps) => <m.AppFrame {...props} />)
);

/** The screen for each address, by the route's name. */
export const SCREENS: Readonly<Record<RouteName, ScreenCode>> = {
    start: screen(SCREEN_FILES.start, () =>
        import('./website/Start.js').then((m) => () => <m.Start />)
    ),
    about: screen(SCREEN_FILES.about, () =>
        import('./website/About.js').then((m) => () => <m.About />)
    ),
    install: screen(SCREEN_FILES.install, () =>
        import('./website/Install.js').then((m) => () => <m.Install />)
    ),
    play: screen(SCREEN_FILES.play, () =>
        import('./app/PlayStart.js').then((m) => () => <m.PlayStart />)
    ),
    new: screen(SCREEN_FILES.new, () =>
        import('./app/NewGame.js').then((m) => () => <m.NewGame />)
    ),
    game: screen(SCREEN_FILES.game, () =>
        import('./app/GameScreen.js').then((m) => () => <m.GameScreen />)
    ),
    scores: screen(SCREEN_FILES.scores, () =>
        import('./app/ScoresScreen.js').then((m) => () => <m.ScoresScreen />)
    ),
    recap: screen(SCREEN_FILES.recap, () =>
        import('./app/RecapScreen.js').then((m) => () => <m.RecapScreen />)
    ),
    history: screen(SCREEN_FILES.history, () =>
        import('./app/HistoryScreen.js').then((m) => () => <m.HistoryScreen />)
    ),
    players: screen(SCREEN_FILES.players, () =>
        import('./app/PlayersList.js').then((m) => () => <m.PlayersList />)
    ),
    player: screen(SCREEN_FILES.player, () =>
        import('./app/PlayerPage.js').then((m) => () => <m.PlayerPage />)
    ),
};

/** The screens of the app, those in its frame. */
const APP_SCREENS: readonly RouteName[] = ROUTES.map(({ name }) => name).filter((name) =>
    Object.hasOwn(SECTION_OF, name)
);

/** Whether a name is a route's, so its screen can be found. */
const isRouteName = (name: string): name is RouteName => Object.hasOwn(SCREENS, name);

/** The files of the code an address draws: the app's frame for a screen of the app, and its screen. */
export const filesAt = (route: Route): string[] => [
    ...(inApp(route) ? [FRAME.file] : []),
    ...(isRouteName(route.name) ? [SCREENS[route.name].file] : []),
];

/** Loads the code an address draws, so the page's first draw finds it in place. */
export const loadScreen = async (route: Route | null): Promise<void> => {
    if (!route) return;
    await Promise.all([
        inApp(route) ? FRAME.code.load() : null,
        isRouteName(route.name) ? SCREENS[route.name].code.load() : null,
    ]);
};

/** Loads the code of every screen and the app's frame, as the prerender and the tests draw them all. */
export const loadEveryScreen = async (): Promise<void> => {
    await Promise.all([FRAME, ...Object.values(SCREENS)].map(({ code }) => code.load()));
};

/** Fetches a screen's code now, as a screen that leads to it is opened. */
export const fetchScreen = (name: RouteName): void => {
    SCREENS[name].code.prefetch();
};

/** The app's frame once its code is in, which the boundary around it waits for. */
export const Frame = (props: FrameProps) => use(FRAME.code.load())(props);

/** Draws a screen once its code is in, which the boundary around it waits for. */
const Loaded = ({ name }: { readonly name: RouteName }) => use(SCREENS[name].code.load())();

/**
 * What a screen for keeping score holds, inside the app's frame, which the app draws around it. A
 * screen with nothing of its own holds nothing, and the frame's bar names it.
 */
export const AppScreen = ({ route }: { readonly route: Route }) => {
    const { name } = route;
    return isRouteName(name) && APP_SCREENS.includes(name) ? <Loaded name={name} /> : null;
};

/** A screen for keeping score whose code is on its way, under the frame's bar that names it. */
export const AppScreenLoading = () => (
    <div aria-busy="true">
        <p className="dk-loading">Loading the screen.</p>
    </div>
);

/** The website's pages at their routes, each drawing its own frame. */
export const Screen = ({ route }: { readonly route: Route }) => (
    <Loaded name={route.name === 'install' || route.name === 'about' ? route.name : 'start'} />
);

/** A page of the website whose code is on its way, in the website's frame with its title. */
export const ScreenLoading = ({ route }: { readonly route: Route }) => (
    <Website current={isRouteName(route.name) ? route.name : undefined}>
        <div className="dk-page gtt-page" aria-busy="true">
            <h1 className="gtt-display gtt-display-page">{route.title}</h1>
            <p className="dk-loading">Loading the page.</p>
        </div>
    </Website>
);

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
