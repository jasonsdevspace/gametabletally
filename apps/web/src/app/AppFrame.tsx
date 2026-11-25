import { attachToast, type ShowToast } from '@jasonsdevspace/design-kit/controls';
import { SkipLink, Toast } from '@jasonsdevspace/design-kit/react';
import {
    createContext,
    type ReactNode,
    useCallback,
    useContext,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';

import { Link } from '../navigation.js';
import { fromHistory, hrefOf, type RouteName } from '../routes.js';
import { TallyMark } from '../website/Website.js';
import { useAwake } from './awake.js';
import { Icon } from './icon.js';
import { GamesProvider } from './opened-game.js';
import { useUpdateOffer } from './update-offer.js';

/**
 * The frame every screen for keeping score sits in: the design kit's app frame, with the screen's
 * name in the bar as its one top heading, a body that scrolls, the one place a toast is shown, a
 * dock for a screen's main button where it has one, and the tab bar at the bottom edge, under the
 * thumb.
 */

/** The top-level places the tab bar reaches. */
export type Section = 'play' | 'history' | 'players';

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
export const SECTION_OF: Readonly<Record<string, Section>> = {
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
 * screen beneath it, and nothing on another section's. A recap sits under the history where its
 * address says it was opened from there, and under play where a game's end opened it.
 */
export const currentOf = (
    tab: Section,
    screen: string,
    search = ''
): 'page' | 'true' | undefined => {
    if (!Object.hasOwn(SECTION_OF, screen)) return undefined;
    const section = screen === 'recap' && fromHistory(search) ? 'history' : SECTION_OF[screen];
    if (section !== tab) return undefined;
    return screen === tab ? 'page' : 'true';
};

/** The tab bar: each top-level place, the one the visitor is in marked. */
const TabBar = ({ screen, search }: { readonly screen: string; readonly search: string }) => (
    <nav className="dk-app-tabs dk-tabbar" aria-label="Sections">
        <ul>
            {TABS.map(({ section, label, icon }) => (
                <li key={section}>
                    <Link href={hrefOf(section)} aria-current={currentOf(section, screen, search)}>
                        {icon}
                        {label}
                    </Link>
                </li>
            ))}
        </ul>
    </nav>
);

/** What a screen outside the frame is given: a toast that shows nothing. */
const ToastContext = createContext<ShowToast>(() => () => undefined);

/** The function a screen shows a toast with, in the frame's one place for it. */
export const useToast = (): ShowToast => useContext(ToastContext);

/** Where a screen draws its main button: the frame's dock, and a way to say a screen holds it. */
interface DockPlace {
    readonly element: HTMLElement | null;
    /**
     * Marks the dock as held while a screen's dock is drawn, and returns the function that lets it
     * go.
     */
    readonly hold: () => () => void;
}

const DockContext = createContext<DockPlace>({ element: null, hold: () => () => undefined });

/**
 * A screen's main button, or two, drawn in the frame's dock under the thumb, which the screen
 * keeps in its own state like anything in its body. The dock is in the frame, so a screen's
 * dock is drawn into it once the frame is on the page, and never in the prerender, where nothing
 * on a screen for keeping score works yet.
 */
export const Dock = ({ children }: { readonly children: ReactNode }) => {
    const { element, hold } = useContext(DockContext);
    useLayoutEffect(hold, [hold]);
    return element ? createPortal(children, element) : null;
};

/** The bar's one action on a screen that has one, after the title. */
const actionOf = (screen: string): ReactNode => {
    switch (screen) {
        case 'play':
            return (
                <Link className="dk-button dk-button-text" href={hrefOf('about')}>
                    About
                </Link>
            );
        case 'player':
            return (
                <Link className="dk-button dk-button-text" href={hrefOf('players')}>
                    All players
                </Link>
            );
        default:
            return null;
    }
};

/**
 * The frame, drawn once for every screen for keeping score and kept as the visitor moves between
 * them, so a toast that offers Undo survives a move. Only the body is drawn afresh for each
 * screen.
 */
export const AppFrame = ({
    screen,
    search = '',
    title,
    children,
}: {
    /** The screen's route name, which picks the tab it marks and the bar's action. */
    readonly screen: string;
    /** The address's query, which says where a recap was opened from, for the tab it marks. */
    readonly search?: string;
    /** The screen's title, shown in the bar as its one top heading. */
    readonly title: string;
    readonly children?: ReactNode;
}) => {
    const shown = useRef<ShowToast | null>(null);
    const [toast, setToast] = useState<HTMLElement | null>(null);
    // The message the toast was last asked to show, which says whether it still shows the offer.
    const last = useRef<string | null>(null);
    const [dock, setDock] = useState<HTMLElement | null>(null);
    const [held, setHeld] = useState(0);
    const hold = useCallback(() => {
        setHeld((count) => count + 1);
        return () => {
            setHeld((count) => count - 1);
        };
    }, []);
    const place = useMemo(() => ({ element: dock, hold }), [dock, hold]);

    // Attached as the toast is drawn, before any screen's effect runs, so a screen can show a
    // toast as it arrives, and taken down by its signal as the frame goes, so its message, its
    // timer and its listeners go with it.
    const attach = useCallback((element: HTMLDivElement) => {
        const controller = new AbortController();
        shown.current = attachToast(element, { signal: controller.signal });
        setToast(element);
        return () => {
            controller.abort();
            shown.current = null;
            setToast(null);
        };
    }, []);

    // The same function for the frame's life, which reaches the toast once it is attached.
    const show = useCallback<ShowToast>((message, action) => {
        last.current = message;
        return shown.current?.(message, action) ?? (() => undefined);
    }, []);
    useUpdateOffer({ screen, search, show, toast, last });
    // The screen stays lit through a game in play, from the round to its scores and back.
    useAwake(screen === 'game' || screen === 'scores');
    return (
        <ToastContext.Provider value={show}>
            <GamesProvider>
                <DockContext.Provider value={place}>
                    <SkipLink target="main" />
                    <div className="dk-app">
                        <header className="dk-app-bar">
                            <TallyMark size={32} />
                            <h1 className="dk-app-title" id="screen-title">
                                {title}
                            </h1>
                            {actionOf(screen)}
                        </header>
                        {/* Named by the bar's heading, so focus arriving here says which screen it is. */}
                        <main
                            id="main"
                            tabIndex={0}
                            className="dk-app-body"
                            aria-labelledby="screen-title"
                        >
                            {children}
                        </main>
                        <div className="dk-app-toast">
                            <Toast ref={attach} />
                        </div>
                        {/* Hidden while no screen holds it, so its row closes and it is no landmark. */}
                        <section
                            ref={setDock}
                            className="dk-app-dock"
                            aria-label="Actions"
                            hidden={held === 0}
                        />
                        <TabBar screen={screen} search={search} />
                    </div>
                </DockContext.Provider>
            </GamesProvider>
        </ToastContext.Provider>
    );
};
