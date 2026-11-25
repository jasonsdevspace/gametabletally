import { StatusProvider, useStatus } from '@jasonsdevspace/design-kit/react';
import {
    Component,
    type ReactNode,
    Suspense,
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
} from 'react';

import { forgetFailedLoads, NotLoaded } from './loader.js';
import { usePlace } from './navigation.js';
import { inApp, type Route, routeAt, titleAt, titleOf } from './routes.js';
import {
    AppScreen,
    AppScreenLoading,
    ErrorPage,
    fetchAt,
    Frame,
    NotFound,
    Screen,
    ScreenFailed,
    ScreenLoading,
} from './screens.js';
import { screenFound, screenMissing } from './update.js';

/**
 * Catches a screen that throws while it draws and shows what it is given in its place, the error
 * page or, inside the app's frame, a few words in the frame's body, so a failure is said in words
 * and never leaves a blank page. A boundary drawn anew for each address starts afresh on a move to
 * another screen, and one kept across moves, as the one around the app's frame is, starts afresh
 * on the next move once it has failed. It sets the page's title too, so a screen that failed is
 * titled as the error page and not as the screen it was, and one around another sets it only once
 * it has failed itself, so it never sets back a title the boundary inside it set.
 */
class Boundary extends Component<
    {
        readonly children: ReactNode;
        readonly title: string;
        /** What shows in the screen's place, given whether its code did not load offline. */
        readonly failed: ReactNode | ((offline: boolean) => ReactNode);
        /** The place, for a boundary kept across moves, which starts afresh when it changes. */
        readonly place?: string;
        /** Whether another boundary inside it titles the page while neither has failed. */
        readonly outer?: boolean;
    },
    { readonly failed: boolean; readonly offline: boolean }
> {
    override state = { failed: false, offline: false };

    static getDerivedStateFromError(error: unknown): {
        readonly failed: boolean;
        readonly offline: boolean;
    } {
        return { failed: true, offline: error instanceof NotLoaded && !navigator.onLine };
    }

    override componentDidMount(): void {
        this.setTitle();
    }

    override componentDidCatch(error: unknown): void {
        if (!(error instanceof NotLoaded)) return;
        // Said now, so the next move to the screen loads its file afresh.
        forgetFailedLoads();
        // A screen's file that did not load with the browser online is one a newer build took off
        // the server, or one the connection let down, and a reload answers either.
        if (navigator.onLine) screenMissing();
    }

    override componentDidUpdate(before: { readonly place?: string }): void {
        if (this.state.failed && before.place !== this.props.place) {
            this.setState({ failed: false, offline: false });
            return;
        }
        this.setTitle();
    }

    override render(): ReactNode {
        const { failed } = this.props;
        if (!this.state.failed) return this.props.children;
        return typeof failed === 'function' ? failed(this.state.offline) : failed;
    }

    private setTitle(): void {
        if (this.props.outer && !this.state.failed) return;
        document.title = titleOf(this.state.failed ? 'Something went wrong' : this.props.title);
    }
}

/**
 * Starts a move as a page load would: the code the new place draws is fetched, the frame's and the
 * screen's together, focus moves to the main region at once, as before the move the bar names the
 * new screen, and a wait that outlasts the kit's loading delay is said on the status line, since
 * the loading line itself is not heard. The page's first draw is no move.
 */
const Moving = ({
    place,
    route,
    begin,
}: {
    readonly place: string;
    readonly route: Route | null;
    /**
     * Marks a move to the place, and says whether it is one rather than the page's first draw,
     * giving what says whether its screen is still on its way.
     */
    readonly begin: (place: string) => (() => boolean) | null;
}) => {
    const say = useStatus();
    useLayoutEffect(() => {
        const stillWaiting = begin(place);
        if (!stillWaiting) return;
        if (route) fetchAt(route);
        document.getElementById('main')?.focus();
        say(() => (stillWaiting() ? 'Loading the screen.' : null), { settle: 400 });
    }, [place, route, say, begin]);
    return null;
};

/**
 * Marks the screen at a new place as drawn, or as failed, beside it, so it waits for the screen's
 * code where that is still on its way. Focus moves to the main region where the move left it
 * elsewhere, as when the page's frame was drawn anew, and a screen that drew takes away a reload
 * an earlier screen's missing file offered. The page's first draw is no move.
 */
const Arrived = ({
    place,
    arrive,
    found,
}: {
    readonly place: string;
    /** Marks the place arrived at, and says whether it is a move rather than the same place. */
    readonly arrive: (place: string) => boolean;
    /** Whether the screen drew, rather than failed. */
    readonly found: boolean;
}) => {
    useEffect(() => {
        if (found) screenFound();
        if (!arrive(place)) return;
        const main = document.getElementById('main');
        if (main && !main.contains(document.activeElement)) main.focus();
    }, [place, arrive, found]);
    return null;
};

/**
 * The app: the screen at the address, or the not-found page for one that is not an address. A
 * move inside the app, to another screen or to the same screen about another thing, sets the
 * page's title and moves focus to the new screen's main region. A screen whose code is still on
 * its way holds its place with its title and a loading line.
 */
export const App = () => {
    const { path, search } = usePlace();
    const route = routeAt(path);
    const place = `${path}${search}`;
    // The place last arrived at, so the arrival is marked once for each move, and never for the
    // page's first draw, even where a check in development runs the effect twice.
    const arrived = useRef(place);

    useEffect(() => {
        // The app has taken the page over once this runs, which the browser tests wait for.
        document.documentElement.dataset['ready'] = 'true';
    }, []);
    // The place a move last began to, and whether its screen is still on its way, for the words
    // said while it is.
    const began = useRef(place);
    const waiting = useRef(false);
    const begin = useCallback((at: string) => {
        if (began.current === at) return null;
        began.current = at;
        waiting.current = true;
        return () => waiting.current;
    }, []);
    const arrive = useCallback((at: string) => {
        waiting.current = false;
        if (arrived.current === at) return false;
        arrived.current = at;
        return true;
    }, []);
    const drawn = <Arrived place={place} arrive={arrive} found />;
    const failedHere = <Arrived place={place} arrive={arrive} found={false} />;
    const moving = <Moving place={place} route={route} begin={begin} />;

    // A screen for keeping score sits in the app's frame, which is kept as the visitor moves
    // between such screens, so a toast survives the move. Only the screen inside is drawn afresh.
    // One status line for the whole app, kept as the visitor moves, so what a screen says as it
    // arrives or as it leaves is heard.
    // The frame's own code is loaded with the app's first screen, so until it arrives the page
    // holds the screen's title and a loading line in the website's frame.
    if (route && inApp(route))
        return (
            <StatusProvider>
                {moving}
                <Boundary
                    title={titleAt(route, search)}
                    place={place}
                    outer
                    failed={
                        <>
                            <ErrorPage />
                            {failedHere}
                        </>
                    }
                >
                    <Suspense fallback={<ScreenLoading route={route} />}>
                        <Frame screen={route.name} search={search} title={titleAt(route, search)}>
                            <Boundary
                                key={place}
                                title={titleAt(route, search)}
                                failed={(offline) => (
                                    <>
                                        <ScreenFailed offline={offline} />
                                        {failedHere}
                                    </>
                                )}
                            >
                                <Suspense fallback={<AppScreenLoading />}>
                                    <AppScreen route={route} />
                                    {drawn}
                                </Suspense>
                            </Boundary>
                        </Frame>
                    </Suspense>
                </Boundary>
            </StatusProvider>
        );
    return (
        <StatusProvider>
            {moving}
            <Boundary
                key={place}
                title={route?.title ?? 'Nothing at this address'}
                failed={
                    <>
                        <ErrorPage />
                        {failedHere}
                    </>
                }
            >
                {route ? (
                    <Suspense fallback={<ScreenLoading route={route} />}>
                        <Screen route={route} />
                        {drawn}
                    </Suspense>
                ) : (
                    <>
                        <NotFound />
                        {drawn}
                    </>
                )}
            </Boundary>
        </StatusProvider>
    );
};
