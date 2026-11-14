import { Component, type ReactNode, useEffect, useRef } from 'react';

import { usePlace } from './navigation.js';
import { routeAt, titleOf } from './routes.js';
import { ErrorPage, NotFound, Screen } from './screens.js';

/**
 * Catches a screen that throws while it draws and shows the error page in its place, so a
 * failure is said in words and never leaves a blank page. A move to another screen starts
 * afresh, since the boundary is drawn anew for each address.
 */
class Boundary extends Component<{ readonly children: ReactNode }, { readonly failed: boolean }> {
    override state = { failed: false };

    static getDerivedStateFromError(): { readonly failed: boolean } {
        return { failed: true };
    }

    override render(): ReactNode {
        return this.state.failed ? <ErrorPage /> : this.props.children;
    }
}

/**
 * The app: the screen at the address, or the not-found page for one that is not an address. A
 * move inside the app sets the page's title and moves focus to the new screen's main region, as
 * a page load would, so a screen reader hears where it has arrived.
 */
export const App = () => {
    const { path } = usePlace();
    const route = routeAt(path);
    const first = useRef(true);

    useEffect(() => {
        document.title = titleOf(route?.title ?? 'Nothing at this address');
        if (first.current) {
            first.current = false;
            return;
        }
        window.scrollTo(0, 0);
        document.getElementById('main')?.focus();
    }, [route]);

    return <Boundary key={path}>{route ? <Screen route={route} /> : <NotFound />}</Boundary>;
};
