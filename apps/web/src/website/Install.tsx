import { Button } from '@jasonsdevspace/design-kit/react';
import { useRef } from 'react';

import { Link } from '../navigation.js';
import { hrefOf } from '../routes.js';
import { install, useInstall } from './install-prompt.js';
import { Website } from './Website.js';

/**
 * How to put the app on a phone. An iPhone's browser makes no offer to install, so its steps are
 * written out. Android's does, so its steps are written out too, for a visitor reading on a
 * laptop, and a browser that makes the offer gets a button that shows it.
 */

interface Step {
    readonly title: string;
    readonly note: string;
}

const IPHONE: readonly Step[] = [
    {
        title: 'Open gametabletally.com in Safari.',
        note: 'Reading this on a laptop? Type the address into Safari on your phone.',
    },
    {
        title: 'Tap the Share button.',
        note: 'It is a square with an arrow. If you do not see it, tap the three dots beside the address, then Share.',
    },
    { title: 'Tap Add to Home Screen.', note: 'Scroll down the list if it is not in sight.' },
    {
        title: 'Tap Add.',
        note: "If you see Open as Web App, leave it on. The app's icon is on your home screen.",
    },
];

const ANDROID: readonly Step[] = [
    {
        title: 'Open gametabletally.com in Chrome.',
        note: 'Reading this on a laptop? Type the address into Chrome on your phone.',
    },
    {
        title: 'Tap the menu.',
        note: 'It is the three dots beside the address, at the top or bottom of the screen.',
    },
    { title: 'Tap Install app.', note: 'On some phones it says Add to home screen.' },
    { title: 'Tap Install.', note: "The app's icon is on your home screen and with your apps." },
];

const Steps = ({ steps }: { readonly steps: readonly Step[] }) => (
    <ol className="dk-steps" role="list">
        {steps.map(({ title, note }, at) => (
            <li key={title}>
                {at === 0 ? null : (
                    <span className="dk-steps-arrow" aria-hidden="true">
                        ↓
                    </span>
                )}
                <strong className="dk-steps-title">{title}</strong>
                <span className="dk-steps-note">{note}</span>
            </li>
        ))}
    </ol>
);

export const Install = () => {
    const offer = useInstall();
    const open = useRef<HTMLAnchorElement>(null);
    return (
        <Website current="install">
            <div className="dk-page gtt-page">
                <p className="dk-eyebrow">A seat at every table</p>
                <h1 className="gtt-display gtt-display-page">Install the app</h1>
                <p className="dk-lead gtt-lead">
                    Put Game Table Tally on your phone&apos;s home screen and it opens like any
                    other app, ready whenever the cards come out.
                </p>
                <p className="dk-actions">
                    {offer.kind === 'offered' ? (
                        <Button
                            accent
                            large
                            onClick={() => {
                                void install().then(() => {
                                    // The button is gone once the browser has its answer, so
                                    // focus moves to the way on rather than to the page's start.
                                    open.current?.focus();
                                });
                            }}
                        >
                            Install the app
                        </Button>
                    ) : null}
                    <Link className="dk-button dk-button-large" href={hrefOf('play')} ref={open}>
                        Open the app
                    </Link>
                </p>
                <p className="gtt-status" role="status">
                    {offer.kind === 'installed'
                        ? 'The app is installed. Open it from your home screen.'
                        : ''}
                </p>

                <div className="gtt-platforms">
                    <section aria-labelledby="iphone">
                        <h2 id="iphone">On an iPhone or iPad</h2>
                        <Steps steps={IPHONE} />
                    </section>
                    <section aria-labelledby="android">
                        <h2 id="android">On an Android phone</h2>
                        <Steps steps={ANDROID} />
                    </section>
                </div>

                <section aria-labelledby="offline">
                    <h2 id="offline">With no connection</h2>
                    <p>
                        Open the app once with a connection, and every page opens with none after
                        that. Games are kept on the phone they were played on, and clearing the
                        browser&apos;s data for this site removes them.
                    </p>
                </section>
            </div>
        </Website>
    );
};
