import { Component, type ReactNode, useEffect, useRef } from 'react';

import { usePlace } from './navigation.js';
import { routeAt, titleOf } from './routes.js';
import { ErrorPage, NotFound, Screen } from './screens.js';

/**
 * Catches a screen that throws while it draws and shows the error page in its place, so a
 * failure is said in words and never leaves a blank page. A move to another screen starts
 * afresh, since the boundary is drawn anew for each address. It sets the page's title too, so a
 * screen that failed is titled as the error page and not as the screen it was.
 */
class Boundary extends Component<
    { readonly children: ReactNode; readonly title: string },
    { readonly failed: boolean }
> {
    override state = { failed: false };

    static getDerivedStateFromError(): { readonly failed: boolean } {
        return { failed: true };
    }

    override componentDidMount(): void {
        this.setTitle();
    }

    override componentDidUpdate(): void {
        this.setTitle();
    }

    override render(): ReactNode {
        return this.state.failed ? <ErrorPage /> : this.props.children;
    }

    private setTitle(): void {
        document.title = titleOf(this.state.failed ? 'Something went wrong' : this.props.title);
    }
}

/**
 * The app: the screen at the address, or the not-found page for one that is not an address. A
 * move inside the app, to another screen or to the same screen about another thing, sets the
 * page's title and moves focus to the new screen's main region, as a page load would, so a screen
 * reader hears where it has arrived.
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
        if (arrived.current === place) return;
        arrived.current = place;
        document.getElementById('main')?.focus();
    }, [place, route]);

    return (
        <Boundary key={place} title={route?.title ?? 'Nothing at this address'}>
            {route ? <Screen route={route} /> : <NotFound />}
        </Boundary>
    );
};
