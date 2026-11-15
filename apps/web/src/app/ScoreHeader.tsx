import { useState } from 'react';

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

/** A total as it is drawn, one card to a character, with a true minus sign. */
export const cardsOf = (total: number): readonly string[] => [
    ...(total < 0 ? ['−'] : []),
    ...String(Math.abs(total)),
];

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
    /** Their total, the round being entered counted in. */
    readonly total: number;
    /** How the total adds up, in a sentence. */
    readonly line: string;
}

export const ScoreHeader = ({ name, total, line }: ScoreHeaderProps) => {
    const [shown, setShown] = useState({ name, total });
    // What the status line says, counted so the same words said twice are heard twice.
    const [said, setSaid] = useState({ words: '', count: 0 });
    // Said as the header is drawn with the change, so the words and the digits arrive together.
    if (shown.name !== name || shown.total !== total) {
        const change = changeOf(shown, { name, total });
        setShown({ name, total });
        if (change !== null) setSaid({ words: change, count: said.count + 1 });
    }
    const cards = cardsOf(total);
    return (
        <div className="gtt-score">
            <p className="dk-eyebrow">Now scoring</p>
            <div className="gtt-score-who">
                <p className="gtt-score-name">{name}</p>
                <span className="gtt-digits" role="img" aria-label={spokenOf(total)}>
                    {cards.map((card, at) => (
                        // Keyed by place from the right and by character, so only a card that
                        // changes flips.
                        <span
                            className="gtt-digit"
                            key={`${String(cards.length - at)}-${card}`}
                            data-sign={card === '−' ? '' : undefined}
                        >
                            {card}
                        </span>
                    ))}
                </span>
            </div>
            <p className="gtt-score-line">{line}</p>
            <p className="dk-visually-hidden" role="status">
                {said.words === '' ? null : <span key={said.count}>{said.words}</span>}
            </p>
        </div>
    );
};
