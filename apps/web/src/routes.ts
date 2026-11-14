/**
 * Every address the app has: the one list the prerender, the screens, the links and the tests
 * all read, so an address added here is built, drawn and checked with nothing else to remember.
 *
 * Each address is an exact path ending in a slash, so GitHub Pages serves its prerendered page
 * and never its not-found page. A page about one thing, a game or a player, takes its id in the
 * query, as `/recap/?id=`, since a path holding the id could not be prerendered and a name can
 * change while an id never does.
 */

export interface Route {
    /** What the app calls the screen. */
    readonly name: string;
    /** The exact path, ending in a slash. */
    readonly path: `/${string}`;
    /** The screen's top heading, and the first part of the page's title. */
    readonly title: string;
    /** Whether the screen is about one thing, named by `?id=` in the address. */
    readonly byId: boolean;
}

export const ROUTES = [
    { name: 'start', path: '/', title: 'Game Table Tally', byId: false },
    { name: 'about', path: '/about/', title: 'About', byId: false },
    { name: 'install', path: '/install/', title: 'Install the app', byId: false },
    { name: 'play', path: '/play/', title: 'Play', byId: false },
    { name: 'new', path: '/new/', title: 'New game', byId: false },
    { name: 'game', path: '/game/', title: 'Game in play', byId: true },
    { name: 'scores', path: '/scores/', title: 'Scores', byId: true },
    { name: 'recap', path: '/recap/', title: 'Recap', byId: true },
    { name: 'history', path: '/history/', title: 'History', byId: false },
    { name: 'players', path: '/players/', title: 'Players', byId: false },
    { name: 'player', path: '/player/', title: 'Player', byId: true },
] as const satisfies readonly Route[];

export type RouteName = (typeof ROUTES)[number]['name'];

/** The page GitHub Pages serves for an address that is not one, with a 404 status. */
export const NOT_FOUND_FILE = '404.html';

/**
 * The route at a path, or null when the path is not an address of the app. A page's own file,
 * `/about/index.html`, is served for its address too, so it is read as the address.
 */
export const routeAt = (path: string): Route | null => {
    const address = path.replace(/\/index\.html$/, '/');
    return ROUTES.find((route) => route.path === address) ?? null;
};

/** The address of a screen, with the id of the thing it is about where it takes one. */
export const hrefOf = (name: RouteName, id?: string): string => {
    const route = ROUTES.find((one) => one.name === name);
    if (!route) throw new Error(`The app has no screen named ${name}.`);
    if (!route.byId) return route.path;
    if (id === undefined)
        throw new Error(`The ${name} screen is about one thing, named by its id.`);
    return `${route.path}?${new URLSearchParams({ id }).toString()}`;
};

/** The title of a page: its heading, then the app's name, or the name alone for the start. */
export const titleOf = (heading: string): string =>
    heading === ROUTES[0].title ? heading : `${heading}, Game Table Tally`;
