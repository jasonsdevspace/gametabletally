import { FLIP_7 } from './flip-7.js';
import { isRecord, isWhole, type Rules } from './rules.js';
import type { Game, Problem, RoundResult, ScoreInput, ScoreResult } from './types.js';

/**
 * Every rule set of every game, in the order an app offers the games. A game whose rules change
 * keeps its earlier versions here, so a game saved under one is still scored by it.
 */
const RULES: readonly Rules[] = [FLIP_7];

/** The newest rule set of each game, in the order an app offers them. */
const NEWEST: readonly Rules[] = RULES.filter(
    (rules) => !RULES.some((other) => other.id === rules.id && other.rules > rules.rules)
);

/** The games the package can score, in the order an app offers them. */
export const GAMES: readonly Game[] = NEWEST.map(({ id, name, rules, minPlayers, maxPlayers }) => ({
    id,
    name,
    rules,
    minPlayers,
    maxPlayers,
}));

/** A problem with the game as a whole. */
const refuse = (code: string, message: string): Problem => ({
    code,
    message,
    round: null,
    player: null,
});

/** A problem with one round as a whole. */
const refuseRound = (code: string, message: string, round: number): Problem => ({
    code,
    message,
    round,
    player: null,
});

/**
 * Reads a game as handed over, or says what it lacks. A caller in another language passes text
 * no type checker saw, so nothing about its shape is taken on trust.
 */
const readInput = (raw: unknown): ScoreInput | string => {
    if (!isRecord(raw)) return 'The game is not an object.';
    const { game, rules, options, players, rounds } = raw;
    if (typeof game !== 'string') return 'The game does not name which game it is.';
    if (!isWhole(rules)) return 'The game does not name the version of its rule set.';
    if (!isRecord(options)) return 'The game does not hold its options.';
    if (!Array.isArray(players)) return 'The game does not list its players.';
    const ids = players.filter((id): id is string => typeof id === 'string' && id !== '');
    if (ids.length !== players.length) return 'A player is not named by an id.';
    if (!Array.isArray(rounds)) return 'The game does not list its rounds.';
    return { game, rules, options, players: ids, rounds };
};

/** What is wrong with the list of players, if anything. */
const playerProblems = (rules: Rules, players: readonly string[]): readonly Problem[] => {
    const problems: Problem[] = [];
    if (players.length < rules.minPlayers)
        problems.push(
            refuse('too-few-players', `${rules.name} takes ${rules.minPlayers} players or more.`)
        );
    if (rules.maxPlayers !== null && players.length > rules.maxPlayers)
        problems.push(
            refuse('too-many-players', `${rules.name} takes ${rules.maxPlayers} players or fewer.`)
        );
    if (new Set(players).size !== players.length)
        problems.push(refuse('player-twice', 'A player is in the game twice.'));
    return problems;
};

/** The players ahead on the totals, in seat order. */
const ahead = (rules: Rules, players: readonly string[], totals: readonly number[]): string[] => {
    const best = rules.ahead === 'highest' ? Math.max(...totals) : Math.min(...totals);
    return players.filter((_, seat) => totals[seat] === best);
};

/** The answer for a game nothing could be scored in. */
const unscored = (input: ScoreInput, problems: readonly Problem[]): ScoreResult => ({
    game: input.game,
    rules: input.rules,
    state: 'in-play',
    rounds: input.rounds.map(() => ({ state: 'refused', scores: {} })),
    totals: Object.fromEntries(input.players.map((player) => [player, 0])),
    leaders: [...input.players],
    winners: [],
    problems,
});

/** What walking the rounds comes to. */
interface Walked {
    readonly rounds: readonly RoundResult[];
    readonly problems: readonly Problem[];
    /** Each player's total, in seat order. */
    readonly totals: readonly number[];
    /** Who has won, as places in the seat order, or null while the game goes on. */
    readonly winners: readonly number[] | null;
}

/** A round nothing is read from, with the reason. */
const passedOver = (walked: Walked, problem: Problem): Walked => ({
    ...walked,
    rounds: [...walked.rounds, { state: 'refused', scores: {} }],
    problems: [...walked.problems, problem],
});

/**
 * The game with one more round read.
 *
 * A round counts toward the totals only when every round before it does. One entered behind a
 * round that is unfinished or refused is passed over, so no game is called over, and nobody the
 * winner, on totals with a round missing from them.
 */
const step = (rules: Rules, input: ScoreInput, walked: Walked, index: number): Walked => {
    if (walked.winners !== null)
        return passedOver(
            walked,
            refuseRound('after-the-end', 'The game was over before this round.', index)
        );
    if (walked.rounds.some(({ state }) => state !== 'scored'))
        return passedOver(
            walked,
            refuseRound('after-a-gap', 'An earlier round has yet to be scored.', index)
        );
    const { players, rounds } = input;
    const outcome = rules.scoreRound(rounds[index], { players, index });
    const complete = players.every((player) => outcome.scores.has(player));
    // The last round may still be in play. One with a round entered after it may not.
    const unfinished = !complete && outcome.problems.length === 0 && index < rounds.length - 1;
    const problems = unfinished
        ? [
              refuseRound(
                  'round-unfinished',
                  'A later round was entered before every player had played this one.',
                  index
              ),
          ]
        : outcome.problems;
    const scored = complete && problems.length === 0;
    const totals = scored
        ? walked.totals.map((total, seat) => total + (outcome.scores.get(players[seat] ?? '') ?? 0))
        : walked.totals;
    return {
        rounds: [
            ...walked.rounds,
            {
                state: scored ? 'scored' : problems.length > 0 ? 'refused' : 'open',
                scores: Object.fromEntries(outcome.scores),
            },
        ],
        problems: [...walked.problems, ...problems],
        totals,
        winners: scored ? rules.winners(totals) : null,
    };
};

/** A game whose shape has been read, scored. */
const scoreRead = (input: ScoreInput): ScoreResult => {
    const known = RULES.filter(({ id }) => id === input.game);
    if (known.length === 0)
        return unscored(input, [
            refuse('unknown-game', `No game has the id ${JSON.stringify(input.game)}.`),
        ]);
    const rules = known.find((candidate) => candidate.rules === input.rules);
    if (!rules)
        return unscored(input, [
            refuse('unknown-rules', `The game has no rule set with the version ${input.rules}.`),
        ]);
    const { players } = input;
    const stopped = [...playerProblems(rules, players), ...rules.checkOptions(input.options)];
    if (stopped.length > 0) return unscored(input, stopped);
    const start: Walked = { rounds: [], problems: [], totals: players.map(() => 0), winners: null };
    const { rounds, problems, totals, winners } = input.rounds.reduce<Walked>(
        (walked, _, index) => step(rules, input, walked, index),
        start
    );
    return {
        game: rules.id,
        rules: rules.rules,
        state: winners === null ? 'in-play' : 'over',
        rounds,
        totals: Object.fromEntries(players.map((player, seat) => [player, totals[seat] ?? 0])),
        leaders: ahead(rules, players, totals),
        winners: (winners ?? []).flatMap((seat) => players[seat] ?? []),
        problems,
    };
};

/** The answer for something that is not a game at all. */
const notAGame = (code: string, message: string): ScoreResult => ({
    game: '',
    rules: 0,
    state: 'in-play',
    rounds: [],
    totals: {},
    leaders: [],
    winners: [],
    problems: [refuse(code, message)],
});

/** Scores whatever is handed over, which may not be a game. */
const scoreAny = (raw: unknown): ScoreResult => {
    const input = readInput(raw);
    return typeof input === 'string' ? notAGame('not-a-game', input) : scoreRead(input);
};

/**
 * Scores a game from everything entered so far.
 *
 * Nothing is kept between calls and nothing is read but what is passed in, so the same game
 * always gets the same answer, and changing an earlier round is scoring the game again with the
 * round changed. Whatever the rules refuse is reported in `problems` and counts toward no total.
 * A round is added to the totals once every player's entry is in and accepted, and only when
 * every round before it has been. It does not throw, whatever it is given.
 */
export const score = (input: ScoreInput): ScoreResult => scoreAny(input);

/**
 * Scores a game handed over as JSON and answers in JSON, for a caller in another language, which
 * passes text across to a script runtime and reads text back. Text that is not JSON, or not a
 * game, is answered with a problem like any other.
 */
export const scoreJson = (game: string): string => {
    let raw: unknown;
    try {
        raw = JSON.parse(game);
    } catch {
        return JSON.stringify(notAGame('not-json', 'The game is not written as JSON.'));
    }
    return JSON.stringify(scoreAny(raw));
};
