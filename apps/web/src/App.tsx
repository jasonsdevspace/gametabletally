import { StatusProvider } from '@jasonsdevspace/design-kit/react';
import { Component, type ReactNode, Suspense, useCallback, useEffect, useRef } from 'react';

import { forgetFailedLoads, NotLoaded } from './loader.js';
import { usePlace } from './navigation.js';
import { inApp, routeAt, titleAt, titleOf } from './routes.js';
import {
    AppScreen,
    AppScreenLoading,
    ErrorPage,
    Frame,
    NotFound,
    Screen,
    ScreenFailed,
    ScreenLoading,
} from './screens.js';
import { screenMissing } from './update.js';

/**
 * Catches a screen that throws while it draws and shows what it is given in its place, the error
 * page or, inside the app's frame, a few words in the frame's body, so a failure is said in words
 * and never leaves a blank page. A move to another screen starts
 * afresh, since the boundary is drawn anew for each address. It sets the page's title too, so a
 * screen that failed is titled as the error page and not as the screen it was.
 */
class Boundary extends Component<
    { readonly children: ReactNode; readonly title: string; readonly failed: ReactNode },
    { readonly failed: boolean }
> {
    override state = { failed: false };

    static getDerivedStateFromError(): { readonly failed: boolean } {
        return { failed: true };
    }

    override componentDidMount(): void {
        this.setTitle();
    }

    override componentDidCatch(error: unknown): void {
        if (!(error instanceof NotLoaded)) return;
        // Said now, so the next move to the screen loads its file afresh.
        forgetFailedLoads();
        // A screen's file that did not arrive with the browser online is one a newer build has
        // taken off the server, so the app offers the reload that brings the newer build.
        if (navigator.onLine) screenMissing();
    }

    override componentDidUpdate(): void {
        this.setTitle();
    }

    override render(): ReactNode {
        return this.state.failed ? this.props.failed : this.props.children;
    }

    private setTitle(): void {
        document.title = titleOf(this.state.failed ? 'Something went wrong' : this.props.title);
    }
}

/**
 * Moves focus to the main region once the screen at a new place has drawn, as a page load would,
 * so a screen reader hears where it has arrived. It is drawn beside the screen, so it waits for the
 * screen's code where that is still on its way. The page's first draw is no move.
 */
const Arrived = ({
    place,
    arrive,
}: {
    readonly place: string;
    /** Marks the place arrived at, and says whether it is a move rather than the same place. */
    readonly arrive: (place: string) => boolean;
}) => {
    useEffect(() => {
        if (arrive(place)) document.getElementById('main')?.focus();
    }, [place, arrive]);
    return null;
};

/**
 * The app: the screen at the address, or the not-found page for one that is not an address. A
 * move inside the app, to another screen or to the same screen about another thing, sets the
 * page's title and moves focus to the new screen's main region once it has drawn. A screen whose
 * code is still on its way holds its place with its title and a loading line.
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
    const arrive = useCallback((at: string) => {
        if (arrived.current === at) return false;
        arrived.current = at;
        return true;
    }, []);
    const drawn = <Arrived place={place} arrive={arrive} />;

    // A screen for keeping score sits in the app's frame, which is kept as the visitor moves
    // between such screens, so a toast survives the move. Only the screen inside is drawn afresh.
    // One status line for the whole app, kept as the visitor moves, so what a screen says as it
    // arrives or as it leaves is heard.
    // The frame's own code is loaded with the app's first screen, so until it arrives the page
    // holds the screen's title and a loading line in the website's frame.
    if (route && inApp(route))
        return (
            <StatusProvider>
                <Boundary title={titleAt(route, search)} failed={<ErrorPage />}>
                    <Suspense fallback={<ScreenLoading route={route} />}>
                        <Frame screen={route.name} search={search} title={titleAt(route, search)}>
                            <Boundary
                                key={place}
                                title={titleAt(route, search)}
                                failed={
                                    <>
                                        <ScreenFailed />
                                        {drawn}
                                    </>
                                }
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
            <Boundary
                key={place}
                title={route?.title ?? 'Nothing at this address'}
                failed={
                    <>
                        <ErrorPage />
                        {drawn}
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
