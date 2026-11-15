import { attachToast, type ShowToast } from '@jasonsdevspace/design-kit/controls';
import { SkipLink, Toast } from '@jasonsdevspace/design-kit/react';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useRef } from 'react';

import { Link } from '../navigation.js';
import { hrefOf, type RouteName } from '../routes.js';
import { TallyMark } from '../website/Website.js';

/**
 * The frame every screen for keeping score sits in: the design kit's app frame, with the screen's
 * name in the bar as its one top heading, a body that scrolls, the one place a toast is shown, a
 * dock where a screen has one, and the tab bar at the bottom edge, under the thumb.
 */

/** The top-level places the tab bar reaches. */
export type Section = 'play' | 'history' | 'players';

/** An icon over a tab's label, drawn in the label's color and hidden from a screen reader. */
const Icon = ({ children }: { readonly children: ReactNode }) => (
    <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        focusable="false"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        {children}
    </svg>
);

const TABS = [
    {
        section: 'play',
        label: 'Play',
        icon: (
            <Icon>
                <rect x="4" y="3" width="11" height="15" rx="2" />
                <path d="M18.5 7v11a3 3 0 0 1-3 3H8" />
            </Icon>
        ),
    },
    {
        section: 'history',
        label: 'History',
        icon: (
            <Icon>
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 2" />
            </Icon>
        ),
    },
    {
        section: 'players',
        label: 'Players',
        icon: (
            <Icon>
                <circle cx="9" cy="8.5" r="3.25" />
                <path d="M3 19.5a6 6 0 0 1 12 0" />
                <circle cx="17" cy="8" r="2.5" />
                <path d="M16 13.6a5 5 0 0 1 5 5.9" />
            </Icon>
        ),
    },
] as const satisfies readonly {
    readonly section: Section & RouteName;
    readonly label: string;
    readonly icon: ReactNode;
}[];

/** The section each screen for keeping score sits under, which its tab marks. */
export const SECTION_OF: Readonly<Partial<Record<RouteName, Section>>> = {
    play: 'play',
    new: 'play',
    game: 'play',
    scores: 'play',
    recap: 'play',
    history: 'history',
    players: 'players',
    player: 'players',
};

/**
 * How a tab marks the place the visitor is in: `page` on the section's own screen, `true` on a
 * screen beneath it, and nothing on another section's.
 */
export const currentOf = (tab: Section, screen: string): 'page' | 'true' | undefined => {
    const section = Object.entries(SECTION_OF).find(([name]) => name === screen)?.[1];
    if (section !== tab) return undefined;
    return screen === tab ? 'page' : 'true';
};

/** The tab bar: each top-level place, the one the visitor is in marked. */
const TabBar = ({ screen }: { readonly screen: string }) => (
    <nav className="dk-app-tabs dk-tabbar" aria-label="Sections">
        <ul>
            {TABS.map(({ section, label, icon }) => (
                <li key={section}>
                    <Link href={hrefOf(section)} aria-current={currentOf(section, screen)}>
                        {icon}
                        {label}
                    </Link>
                </li>
            ))}
        </ul>
    </nav>
);

/** Shows a toast in the frame's one place for it. Does nothing before the frame is drawn. */
const ToastContext = createContext<ShowToast>(() => () => undefined);

/** The function a screen shows a toast with, in the frame's one place for it. */
export const useToast = (): ShowToast => useContext(ToastContext);

export const AppFrame = ({
    screen,
    title,
    action,
    dock,
    children,
}: {
    /** The name of the screen drawn, which marks its tab. */
    readonly screen: string;
    /** The screen's name, its one top heading. */
    readonly title: string;
    /** The bar's one action, after the title. */
    readonly action?: ReactNode;
    /** The dock's label and what it holds, for a screen with a main button. */
    readonly dock?: { readonly label: string; readonly children: ReactNode };
    readonly children?: ReactNode;
}) => {
    const toast = useRef<HTMLDivElement>(null);
    const shown = useRef<ShowToast | null>(null);

    useEffect(() => {
        if (toast.current) shown.current = attachToast(toast.current);
        return () => {
            shown.current = null;
        };
    }, []);

    // The same function for the frame's life, which reaches the toast once it is attached.
    const show = useCallback<ShowToast>(
        (message, action) => shown.current?.(message, action) ?? (() => undefined),
        []
    );
    return (
        <ToastContext.Provider value={show}>
            <SkipLink target="main" />
            <div className="dk-app">
                <header className="dk-app-bar">
                    <TallyMark size={32} />
                    <h1 className="dk-app-title">{title}</h1>
                    {action}
                </header>
                <main id="main" tabIndex={0} className="dk-app-body">
                    {children}
                </main>
                <div className="dk-app-toast">
                    <Toast ref={toast} />
                </div>
                {dock ? (
                    <section className="dk-app-dock" aria-label={dock.label}>
                        {dock.children}
                    </section>
                ) : null}
                <TabBar screen={screen} />
            </div>
        </ToastContext.Provider>
    );
};
