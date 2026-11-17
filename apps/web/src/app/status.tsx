import { attachStatus } from '@jasonsdevspace/design-kit/controls';
import { type RefObject, useCallback, useRef } from 'react';

/*
 * What a screen says to a screen reader without moving focus, on the kit's status line. The line is
 * drawn by the kit's `StatusLine`, on the page from the first draw, and spoken on by the kit's
 * `attachStatus`, which empties it a moment before each message, so the same words said twice are
 * heard twice, and empties it again after a while.
 */

/** The ref a screen hands its `StatusLine`, and the function that says the next words on it. */
export const useStatus = (): readonly [
    RefObject<HTMLParagraphElement | null>,
    (words: string) => void,
] => {
    const line = useRef<HTMLParagraphElement>(null);
    const say = useCallback((words: string) => {
        if (line.current !== null) attachStatus(line.current)(words);
    }, []);
    return [line, say];
};
