import { StatusLine } from '@jasonsdevspace/design-kit/react';
import { useEffect, useState } from 'react';

import { useStatus } from './status.js';

/**
 * The top of every game's screen: whose turn it is, their total as flip digits large enough to read
 * from across the table, and a line that says how the total adds up. The digits are one image to a
 * screen reader, named by the number. One status line, in the page from the first draw, says what
 * changed: the new total after an entry, and only who is next after a turn, since a saved round's
 * own summary is the toast's to say.
 */

/** A total as a screen reader says it, with a minus sign said as a word. */
export const spokenOf = (total: number): string =>
    total < 0 ? `minus ${String(-total)}` : String(total);

/** The true minus sign a negative total is drawn with. */
const SIGN = '−';

/** A total as it is drawn, one card to a character, with a true minus sign. */
export const cardsOf = (total: number): readonly string[] => [
    ...(total < 0 ? [SIGN] : []),
    ...String(Math.abs(total)),
];

/**
 * What tells a card apart from one drawn before it: the player, so a new player's total is drawn
 * afresh, then the sign alone, or a digit's place from the right and its character, so within one
 * player's total only a card that changes is drawn afresh.
 */
const keysOf = (name: string, cards: readonly string[]): readonly string[] =>
    cards.map((card, at) =>
        card === SIGN ? `${name}|sign` : `${name}|${String(cards.length - at)}|${card}`
    );

/** What the status line says when the player or their total changes, or null for no change. */
export const changeOf = (
    before: { readonly name: string; readonly total: number },
    after: { readonly name: string; readonly total: number }
): string | null => {
    if (before.name !== after.name) return `${after.name} is next.`;
    if (before.total !== after.total) return `${after.name}'s total is ${spokenOf(after.total)}.`;
    return null;
};

export interface ScoreHeaderProps {
    /** The name of the player whose turn it is. */
    readonly name: string;
    /** Their total, counting the round being entered. */
    readonly total: number;
    /** How the total adds up, in a sentence. */
    readonly line: string;
}

export const ScoreHeader = ({ name, total, line }: ScoreHeaderProps) => {
    const [shown, setShown] = useState({ name, total });
    // The cards of the first draw, which stand still, so a total flips only as it changes and not
    // as the screen opens.
    const [still] = useState(() => new Set(keysOf(name, cardsOf(total))));
    // The change to say, counted so the same words said twice are said twice. It is worked out in
    // the render that draws the change and said once that render is on the page.
    const [change, setChange] = useState({ words: '', count: 0 });
    const [status, say] = useStatus();
    if (shown.name !== name || shown.total !== total) {
        const words = changeOf(shown, { name, total });
        setShown({ name, total });
        if (words !== null) setChange({ words, count: change.count + 1 });
    }
    useEffect(() => {
        if (change.words !== '') say(change.words);
    }, [change, say]);
    const cards = cardsOf(total);
    const keys = keysOf(name, cards);
    return (
        <div className="gtt-score">
            <p className="dk-eyebrow">Now scoring</p>
            <div className="gtt-score-who">
                <p className="gtt-score-name">{name}</p>
                <span className="gtt-digits" role="img" aria-label={spokenOf(total)}>
                    {cards.map((card, at) => {
                        const key = keys[at] ?? card;
                        return (
                            <span
                                className="gtt-digit"
                                key={key}
                                data-sign={card === SIGN ? '' : undefined}
                                data-still={still.has(key) ? '' : undefined}
                            >
                                {card}
                            </span>
                        );
                    })}
                </span>
            </div>
            {line === '' ? null : <p className="gtt-score-line">{line}</p>}
            <StatusLine ref={status} />
        </div>
    );
};
