import { useStatus } from '@jasonsdevspace/design-kit/react';
import { useEffect, useState } from 'react';

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

/** A number as it is drawn, with a true minus sign, as a card's face shows it. */
export const drawnOf = (total: number): string => cardsOf(total).join('');

/**
 * What tells a card apart from one drawn before it: the player, so a new player's total is drawn
 * afresh, then the sign alone, or a digit's place from the right and its character, so within one
 * player's total only a card that changes is drawn afresh.
 */
const keysOf = (name: string, cards: readonly string[]): readonly string[] =>
    cards.map((card, at) =>
        card === SIGN ? `${name}|sign` : `${name}|${String(cards.length - at)}|${card}`
    );

/**
 * What the header shows: whose turn it is, their total, and, for a game whose round is a number
 * typed in, what they have this round, or null for nothing yet, so each press is heard even where
 * the total stays the same.
 */
interface Shown {
    readonly name: string;
    readonly total: number;
    readonly round?: number | null | undefined;
}

/**
 * What the status line says when the player, their total or their round changes, or null for no
 * change. A new turn can carry a sentence of what to do, said after who is next.
 */
export const changeOf = (before: Shown, after: Shown, next?: string): string | null => {
    if (before.name !== after.name)
        return next === undefined ? `${after.name} is next.` : `${after.name} is next. ${next}`;
    if (after.round !== undefined && before.round !== after.round)
        return after.round === null
            ? `${after.name}, nothing this round, ${spokenOf(after.total)} in all.`
            : `${after.name}, ${spokenOf(after.round)} this round, ${spokenOf(after.total)} in all.`;
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
    /**
     * What the player has this round, for a game whose round is a number typed in, or null for
     * nothing yet, which the status line says with the total as each press changes it.
     */
    readonly round?: number | null | undefined;
    /** What the player whose turn it is does first, said after who is next. */
    readonly next?: string | undefined;
}

export const ScoreHeader = ({ name, total, line, round, next }: ScoreHeaderProps) => {
    const [shown, setShown] = useState<Shown>({ name, total, round });
    // The cards of the first draw, which stand still, so a total flips only as it changes and not
    // as the screen opens.
    const [still] = useState(() => new Set(keysOf(name, cardsOf(total))));
    // The change to say, worked out in the render that draws it and said once that render is on the
    // page. Each is an object of its own, so the same words said twice are said twice.
    const [change, setChange] = useState<{ readonly words: string } | null>(null);
    const say = useStatus();
    if (shown.name !== name || shown.total !== total || shown.round !== round) {
        const words = changeOf(shown, { name, total, round }, next);
        setShown({ name, total, round });
        if (words !== null) setChange({ words });
    }
    useEffect(() => {
        if (change !== null) say(change.words);
    }, [change, say]);
    const cards = cardsOf(total);
    const keys = keysOf(name, cards);
    return (
        <div className="dk-stack dk-stack-pair gtt-score">
            <p className="dk-eyebrow">Now scoring</p>
            <div className="dk-split">
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
        </div>
    );
};
