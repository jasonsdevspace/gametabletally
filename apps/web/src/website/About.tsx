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
                    Game Table Tally keeps score at the game table. One phone is passed around, each
                    round is tapped in, and the app adds it up by the game&apos;s own rules.
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
                            {NOT_AFFILIATED} Each game is named in plain words so a table can find
                            its own, and none of their artwork is used.
                        </dd>
                    </div>
                </dl>
                <section aria-labelledby="look">
                    <h2 id="look">Light and dark</h2>
                    <div ref={theme}>
                        <ThemeSwitch noscript="With scripts on, a switch for light and dark sits here." />
                    </div>
                </section>
                <p>
                    <Link href={hrefOf('install')}>Install the app</Link> to keep it on your phone.
                </p>
            </div>
        </Website>
    );
};
