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
                        The app never sends your games or your players anywhere. Names and scores
                        stay on the phone they were entered on, and leave it only in a file you save
                        yourself.
                    </p>
                    <p>
                        To see how many people use it, the app counts visits with a service called
                        Plausible. Plausible sets no cookies and does not follow you to other sites.
                    </p>
                    <p>
                        It counts the pages you open, each game started, each game finished and each
                        install. A game started or finished is counted with the game&apos;s name,
                        such as Skyjo, and nothing else. No count holds a name, a score or anything
                        that says who you are. With each page, Plausible also notes how long it
                        stayed open and how far it was scrolled, and works out the country, browser
                        and kind of device from the request without keeping the connection&apos;s
                        address.
                    </p>
                    <p>
                        With no connection, a game started, a game finished or an install is kept on
                        the phone and sent once the connection is back. If too many are waiting, new
                        ones are dropped. If your browser sends Global Privacy Control, a setting
                        that asks sites not to track you, nothing is counted at all.
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
