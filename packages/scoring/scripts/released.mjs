/**
 * The answers a rule set was released with, pinned so they never change under its version.
 *
 * A version of a rule set always means the same rules, so a phone and a server on different builds
 * score a game that names it the same way, which record 5 sets out. Every case is pinned by its name
 * and a digest of what goes in and of the answer that comes out. A pinned answer may never change and
 * a pinned case may never be taken away, so a change to how a game scores, a correction included, is
 * a new version. One exception: an answer that refused the game as a whole because it named an option
 * or a value the rule set did not have may change, since a game refused that way was given no score,
 * and a later addition, such as a new option, may accept it.
 */
import { createHash } from 'node:crypto';

/** The refusals of a whole game that an addition to the rule set may lift. */
const LIFTED_BY_ADDITIONS = new Set(['unknown-option', 'value-not-allowed']);

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

/**
 * Whether an answer refused the game as a whole only for naming an option or a value the rule set
 * did not have, reading none of its rounds, which a later addition may accept.
 */
export const liftable = (expect) =>
    expect.problems.length > 0 &&
    expect.problems.every(({ code, round }) => round === null && LIFTED_BY_ADDITIONS.has(code)) &&
    expect.rounds.every(({ state }) => state === 'skipped');

/** A case pinned: its name, what goes in, what comes out, and whether an addition may change it. */
export const pinOf = (one) => ({
    name: one.name,
    input: inputOf(one),
    answer: answerOf(one),
    liftable: liftable(one.expect),
});

/**
 * What a file of cases breaks of the answers its rule set was released with, as sentences: a
 * pinned case taken away, and a pinned answer changed that an addition could not have changed.
 */
export const breaks = (pinned, file) => {
    const now = new Map(file.cases.map((one) => [inputOf(one), one]));
    return pinned.answers.flatMap((pin) => {
        const one = now.get(pin.input);
        if (!one) return [`the case "${pin.name}" is gone`];
        if (answerOf(one) === pin.answer || pin.liftable) return [];
        return [`the answer to "${one.name}" changed`];
    });
};

/** The cases of a file not yet pinned, by name. */
export const unpinned = (pinned, file) => {
    const known = new Set(pinned.answers.map(({ input }) => input));
    return file.cases.filter((one) => !known.has(inputOf(one))).map(({ name }) => name);
};

/**
 * The pins of a file once its new cases are pinned and each answer an addition changed is pinned
 * again as it now stands. A pin that would break is left as it is, for `breaks` to name.
 */
export const pinned = (before, file) => {
    const now = new Map(file.cases.map((one) => [inputOf(one), one]));
    const kept = before.answers.map((pin) => {
        const one = now.get(pin.input);
        return one && (pin.liftable || answerOf(one) === pin.answer) ? pinOf(one) : pin;
    });
    const known = new Set(kept.map(({ input }) => input));
    const added = file.cases.filter((one) => !known.has(inputOf(one))).map(pinOf);
    return { game: file.game, rules: file.rules, answers: [...kept, ...added] };
};
