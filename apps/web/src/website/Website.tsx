import { GAMES } from '@gametabletally/scoring';
import { SkipLink } from '@jasonsdevspace/design-kit/react';
import type { ReactNode } from 'react';

import { MARK } from '../mark.js';
import { Link } from '../navigation.js';
import { hrefOf, type RouteName } from '../routes.js';
import { listOf } from './games.js';

/**
 * The website's frame, around the pages a visitor reads before they keep score: the first visit,
 * the install page, the about page, and the pages for an address that is not one and for an
 * error. It is the design kit's skip link, the app's own header and the app's own footer, drawn
 * in the kit's footer style. It names no portfolio, so the site reads as the app's own, and the
 * story of how it was made is told on the portfolio. A screen for keeping score is drawn without
 * it, so play keeps the whole screen.
 */

/** The line that says whose games these are not, built from the games' own names. */
export const NOT_AFFILIATED = `Game Table Tally is not affiliated with the publishers of ${listOf(
    GAMES.map((game) => game.name),
    'or'
)}.`;

/** The header's links, each always in view, with no menu to open. */
const LINKS = [
    { name: 'install', label: 'Install' },
    { name: 'about', label: 'About' },
    { name: 'play', label: 'Open the app' },
] as const satisfies readonly { readonly name: RouteName; readonly label: string }[];

/** The app's mark: four tally strokes and the fifth across them, on the accent. */
export const TallyMark = ({
    size,
    className,
}: {
    readonly size: number;
    /** A class to draw it with besides its own, such as the kit's mark in a site's header. */
    readonly className?: string;
}) => (
    <svg
        className={[className, 'gtt-mark'].filter(Boolean).join(' ')}
        width={size}
        height={size}
        viewBox={`0 0 ${String(MARK.box)} ${String(MARK.box)}`}
        aria-hidden="true"
        focusable="false"
    >
        <rect width={MARK.box} height={MARK.box} rx={MARK.corners} />
        <path d={MARK.strokes} strokeWidth={MARK.strokeWidth} />
    </svg>
);

/** The page a link leads to, marked for a screen reader and drawn as more than a color. */
const currentIf = (here: boolean) => (here ? ('page' as const) : undefined);

/**
 * A page of the website: its frame, its main region, which the skip link lands on, and its one
 * top heading, drawn by the page itself.
 */
export const Website = ({
    current,
    reload = false,
    children,
}: {
    /** The page this is, so its link is marked, or none for a page the header does not list. */
    readonly current?: RouteName | undefined;
    /**
     * Whether the header's links load their page afresh, as on the error page, where whatever
     * failed may still be held in memory. Otherwise they move inside the app with no reload.
     */
    readonly reload?: boolean;
    readonly children: ReactNode;
}) => {
    const Way = reload ? 'a' : Link;
    return (
        <>
            <SkipLink target="main" />
            <header className="dk-site-header">
                <Way className="dk-site-brand" href={hrefOf('start')}>
                    <TallyMark size={32} className="dk-site-mark" />
                    Game Table Tally
                </Way>
                <nav aria-label="Website">
                    <ul className="dk-pills" role="list">
                        {LINKS.map(({ name, label }) => (
                            <li key={name}>
                                <Way
                                    className="dk-pill"
                                    href={hrefOf(name)}
                                    aria-current={currentIf(current === name)}
                                >
                                    {label}
                                </Way>
                            </li>
                        ))}
                    </ul>
                </nav>
            </header>
            <main id="main" tabIndex={-1} className="gtt-site">
                {children}
            </main>
            <footer className="dk-footer">
                <p>
                    Game Table Tally is a free scorekeeper for the game table.{' '}
                    <Way href={hrefOf('about')} aria-current={currentIf(current === 'about')}>
                        About the app
                    </Way>{' '}
                    says how it works, what it counts and who made it. {NOT_AFFILIATED}
                </p>
            </footer>
        </>
    );
};
