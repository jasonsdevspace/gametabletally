/**
 * The answers a rule set was released with, pinned so they never change under its version.
 *
 * A version of a rule set always means the same rules, so a phone and a server on different builds
 * score a game it names the same way, which record 5 sets out. Every case is pinned by a digest of
 * what goes in and of the answer that comes out. A pinned answer may never change and a pinned case
 * may never be taken away, so a change to how a game scores, a correction included, is a new
 * version. One exception: an answer that refused the game as a whole, such as one naming an option
 * the game did not have, may change, since no game refused that way was ever played or saved, and a
 * later addition, such as a new option, may accept it.
 */
import { createHash } from 'node:crypto';

/** A value as JSON with every object's keys in order, so the same value is always the same text. */
const canonical = (value) =>
    JSON.stringify(value, (_, inner) =>
        inner !== null && typeof inner === 'object' && !Array.isArray(inner)
            ? Object.fromEntries(
                  Object.entries(inner).sort(([one], [other]) =>
                      one < other ? -1 : one > other ? 1 : 0
                  )
              )
            : inner
    );

const digest = (text) => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** A digest of what a case hands over, its game or its text. */
export const inputOf = (one) =>
    digest(one.text === undefined ? `input:${canonical(one.input)}` : `text:${one.text}`);

/** A digest of the answer a case expects. */
export const answerOf = (one) => digest(canonical(one.expect));

/** Whether an answer refuses the game as a whole, reading none of its rounds. */
export const refusedWhole = (expect) =>
    expect.problems.some(({ round }) => round === null) &&
    expect.rounds.every(({ state }) => state === 'skipped');

/** A case pinned: what goes in, what comes out, and whether that refused the game as a whole. */
export const pinOf = (one) => ({
    input: inputOf(one),
    answer: answerOf(one),
    whole: refusedWhole(one.expect),
});

/**
 * What a file of cases breaks of the answers its rule set was released with, as sentences: a
 * pinned case taken away, and a pinned answer changed that did not refuse the game as a whole.
 */
export const breaks = (pinned, file) => {
    const now = new Map(file.cases.map((one) => [inputOf(one), one]));
    return pinned.answers.flatMap((pin) => {
        const one = now.get(pin.input);
        if (!one) return [`a case pinned as ${pin.input} is gone`];
        if (answerOf(one) === pin.answer || pin.whole) return [];
        return [`the answer to "${one.name}" changed`];
    });
};

/** The cases of a file not yet pinned, by name. */
export const unpinned = (pinned, file) => {
    const known = new Set(pinned.answers.map(({ input }) => input));
    return file.cases.filter((one) => !known.has(inputOf(one))).map(({ name }) => name);
};

/**
 * The pins of a file once its new cases are pinned, and an answer that refused the game as a whole
 * is pinned again as it now stands. A pin that would break is left as it is, for `breaks` to name.
 */
export const pinned = (before, file) => {
    const now = new Map(file.cases.map((one) => [inputOf(one), one]));
    const kept = before.answers.map((pin) => {
        const one = now.get(pin.input);
        return one && pin.whole && answerOf(one) !== pin.answer ? pinOf(one) : pin;
    });
    const known = new Set(kept.map(({ input }) => input));
    const added = file.cases.filter((one) => !known.has(inputOf(one))).map(pinOf);
    return { game: file.game, rules: file.rules, answers: [...kept, ...added] };
};
