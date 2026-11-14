import { GAMES } from '@gametabletally/scoring';

import { Link } from '../navigation.js';
import { hrefOf, ROUTES } from '../routes.js';
import { cardOf, listOf, playersOf } from './games.js';
import photoSmall from './images/game-table-440.webp';
import photoLarge from './images/game-table-880.webp';
import { Website } from './Website.js';

/**
 * The first visit: what the app is, the games it scores, and the two ways on, to open it or to
 * install it. A visitor on a laptop who has never heard of it learns it here, and one with the app
 * on their phone finds the way to keep score at the top.
 */

const NAMES = listOf(
    GAMES.map((game) => game.name),
    'or'
);

/** What sets the app apart, in three short points. */
const POINTS = [
    {
        title: 'One phone for the table',
        text: 'Pass it around. Each player taps in their own round.',
    },
    {
        title: 'No connection needed',
        text: 'Once it has opened, it works in a cabin, a campsite or a basement.',
    },
    {
        title: 'Nothing to sign up for',
        text: 'No account and no email. Open it and start a game.',
    },
] as const;

export const Start = () => (
    <Website current="start">
        <section className="gtt-hero">
            <div className="gtt-hero-text">
                <p className="dk-eyebrow">For game night</p>
                <h1 className="gtt-display gtt-display-hero">{ROUTES[0].title}</h1>
                <p className="gtt-display gtt-hero-line">Keep the score. Stay in the moment.</p>
                <p className="gtt-lead">
                    One phone, passed around the table. Tap in each round, and the app adds it up by
                    the rules of {NAMES}.
                </p>
                <p className="gtt-actions">
                    <Link
                        className="dk-button dk-button-accent dk-button-large"
                        href={hrefOf('play')}
                    >
                        Start a game
                    </Link>
                    <Link className="dk-button dk-button-large" href={hrefOf('install')}>
                        Install the app
                    </Link>
                </p>
                <ul className="gtt-ticks" role="list">
                    <li>Free</li>
                    <li>No account</li>
                    <li>Made for phones</li>
                </ul>
            </div>
            <img
                className="gtt-hero-photo"
                src={photoLarge}
                srcSet={`${photoSmall} 440w, ${photoLarge} 880w`}
                sizes="(min-width: 48rem) 28rem, calc(100vw - 2rem)"
                width={880}
                height={1008}
                alt="Numbered cards in blue, green and gold laid out on a table, with wooden tokens, a score pad and a pencil."
                fetchPriority="high"
                decoding="async"
            />
        </section>

        <section className="gtt-band" aria-labelledby="games">
            <p className="dk-eyebrow">Your table, your game</p>
            <h2 id="games" className="gtt-display gtt-display-section">
                The games it scores
            </h2>
            <ul className="gtt-tiles" role="list" aria-labelledby="games">
                {GAMES.map((game) => {
                    const { line, mark } = cardOf(game.id);
                    return (
                        <li key={game.id} className="gtt-tile" data-game={game.id} data-mark={mark}>
                            <h3>{game.name}</h3>
                            {line === '' ? null : <p>{line}</p>}
                            <p className="gtt-tile-players">{playersOf(game)}</p>
                        </li>
                    );
                })}
            </ul>
        </section>

        <section className="gtt-band gtt-band-surface" aria-labelledby="why">
            <h2 id="why" className="dk-visually-hidden">
                Why it is made this way
            </h2>
            <ul className="gtt-points" role="list">
                {POINTS.map(({ title, text }) => (
                    <li key={title}>
                        <h3>{title}</h3>
                        <p>{text}</p>
                    </li>
                ))}
            </ul>
        </section>

        <section className="gtt-band gtt-closing" aria-labelledby="another">
            <div>
                <p className="dk-eyebrow">Another round?</p>
                <h2 id="another" className="gtt-display gtt-display-section">
                    Good company, great games
                </h2>
            </div>
            <p className="gtt-actions">
                <Link className="dk-button dk-button-accent dk-button-large" href={hrefOf('play')}>
                    Pull up a seat
                </Link>
            </p>
        </section>
    </Website>
);
