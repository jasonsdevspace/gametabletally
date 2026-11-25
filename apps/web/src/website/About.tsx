import { GAMES } from '@gametabletally/scoring';
import { attachThemeSwitch } from '@jasonsdevspace/design-kit/controls';
import { ThemeSwitch } from '@jasonsdevspace/design-kit/react';
import { useEffect, useRef } from 'react';

import { Link } from '../navigation.js';
import { hrefOf } from '../routes.js';
import { Backup } from './Backup.js';
import { listOf } from './games.js';
import { NOT_AFFILIATED, Website } from './Website.js';

/**
 * What the app is, whose games it names and does not own, the games saved on the phone, what is
 * counted and what never leaves the phone, and the switch for light and dark.
 */
export const About = () => {
    const theme = useRef<HTMLDivElement>(null);
    useEffect(() => (theme.current ? attachThemeSwitch(theme.current) : undefined), []);
    const names = GAMES.map((game) => game.name);
    return (
        <Website current="about">
            <div className="dk-page gtt-page">
                <h1 className="gtt-display gtt-display-page">About</h1>
                <p className="dk-lead gtt-lead">
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
                <Backup />
                <section aria-labelledby="privacy">
                    <h2 id="privacy">Privacy</h2>
                    <p>
                        Your games and your players never leave the phone. Names and scores are kept
                        on the phone they were entered on and are not sent anywhere.
                    </p>
                    <p>
                        The app counts how many people use it, with Plausible, which sets no cookies
                        and does not follow you to other sites. It counts the pages opened, and each
                        time a game is started, a game is finished and the app is installed. A game
                        started or finished is counted with the game&apos;s name, such as Skyjo, and
                        nothing else. No count holds a name, a score or anything that says who you
                        are.
                    </p>
                    <p>
                        With no connection, these counts are kept on the phone and sent once it is
                        back. If too many pile up, the newest are dropped. A browser set to send
                        Global Privacy Control is not counted at all.
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
