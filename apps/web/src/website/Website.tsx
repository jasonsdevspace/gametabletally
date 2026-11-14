import { GAMES } from '@gametabletally/scoring';
import { DemoFooter, PortfolioStrip, SkipLink } from '@jasonsdevspace/design-kit/react';
import type { ReactNode } from 'react';

import { Link } from '../navigation.js';
import { hrefOf, type RouteName } from '../routes.js';
import { listOf } from './games.js';

/**
 * The website's frame, around the pages a visitor reads before they keep score: the first visit,
 * the install page, the about page, and the pages for an address that is not one and for an
 * error. It is the design kit's skip link, strip and footer, with the app's own header between
 * the strip and the page. The screens for keeping score are drawn in the app's frame instead.
 */

/** The repository, which the strip and the footer link to. */
export const SOURCE = 'https://github.com/jasonsdevspace/gametabletally';

/** The line that says whose games these are not, built from the games' own names. */
export const NOT_AFFILIATED = `Game Table Tally is not affiliated with the publishers of ${listOf(
    GAMES.map((game) => game.name),
    'or'
)}.`;

/** The header's links, each always in view, with no menu to open. */
const LINKS = [
    { name: 'install', label: 'Get the app' },
    { name: 'about', label: 'About' },
    { name: 'play', label: 'Start scoring' },
] as const satisfies readonly { readonly name: RouteName; readonly label: string }[];

/** The app's mark: four tally strokes and the fifth across them, on the accent. */
export const TallyMark = ({ size }: { readonly size: number }) => (
    <svg
        className="gtt-mark"
        width={size}
        height={size}
        viewBox="0 0 64 64"
        aria-hidden="true"
        focusable="false"
    >
        <rect width="64" height="64" rx="14" />
        <path d="M20 16v32M28 16v32M36 16v32M44 16v32M12 40l42-14" />
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
    children,
}: {
    /** The page this is, so its link is marked, or none for a page the header does not list. */
    readonly current?: RouteName | undefined;
    readonly children: ReactNode;
}) => (
    <>
        <SkipLink target="main" />
        <PortfolioStrip
            about={hrefOf('about')}
            source={SOURCE}
            current={current === 'about' ? 'about' : undefined}
        />
        <header className="gtt-site-header">
            <Link
                className="gtt-brand"
                href={hrefOf('start')}
                aria-current={currentIf(current === 'start')}
            >
                <TallyMark size={32} />
                Game Table Tally
            </Link>
            <nav aria-label="Website">
                <ul className="gtt-site-links" role="list">
                    {LINKS.map(({ name, label }) => (
                        <li key={name}>
                            <Link href={hrefOf(name)} aria-current={currentIf(current === name)}>
                                {label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>
        </header>
        <main id="main" tabIndex={-1} className="gtt-site">
            {children}
        </main>
        <DemoFooter
            name="Game Table Tally"
            about={hrefOf('about')}
            source={SOURCE}
            current={current === 'about' ? 'about' : undefined}
        >
            {NOT_AFFILIATED}
        </DemoFooter>
    </>
);
