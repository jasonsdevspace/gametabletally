import { GAMES } from '@gametabletally/scoring';
import { attachThemeSwitch } from '@jasonsdevspace/design-kit/controls';
import { ThemeSwitch } from '@jasonsdevspace/design-kit/react';
import { useEffect, useRef } from 'react';

import { Link } from '../navigation.js';
import { hrefOf } from '../routes.js';
import { listOf } from './games.js';
import { NOT_AFFILIATED, Website } from './Website.js';

/** What the app is, whose games it names and does not own, and the switch for light and dark. */
export const About = () => {
    const theme = useRef<HTMLDivElement>(null);
    useEffect(() => (theme.current ? attachThemeSwitch(theme.current) : undefined), []);
    const names = GAMES.map((game) => game.name);
    return (
        <Website current="about">
            <div className="gtt-page">
                <h1 className="gtt-display gtt-display-page">About</h1>
                <p className="gtt-lead">
                    Game Table Tally keeps score at the game table, for free.
                </p>
                <dl className="gtt-facts">
                    <div>
                        <dt>What it is</dt>
                        <dd>
                            A free scorekeeper for {listOf(names, 'and')}, made for a phone and
                            working with no connection once it has opened.
                        </dd>
                    </div>
                    <div>
                        <dt>Whose games these are</dt>
                        <dd>
                            {NOT_AFFILIATED} The games are named only so you can find yours. None of
                            their artwork is used here.
                        </dd>
                    </div>
                </dl>
                <section aria-labelledby="how">
                    <h2 id="how">How it works</h2>
                    <p>
                        Pass one phone around the table and tap in each round as it ends. The app
                        adds every round up by the game&apos;s own rules and keeps the totals, so
                        nobody does the sums or argues over a rule.
                    </p>
                    <p>
                        Games are saved on the phone they were played on. Once the app has opened
                        with a connection, it works with none.
                    </p>
                </section>
                <section aria-labelledby="look">
                    <h2 id="look">Light and dark</h2>
                    <div ref={theme}>
                        <ThemeSwitch noscript="Turn on JavaScript to switch between light and dark." />
                    </div>
                </section>
                <p>
                    <Link href={hrefOf('install')}>Install the app</Link> to keep it on your phone.
                </p>
            </div>
        </Website>
    );
};
