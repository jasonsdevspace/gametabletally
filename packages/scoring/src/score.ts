import { FLIP_7 } from './flip-7.js';
import type { Rules } from './rules.js';
import type { Game, Problem, RoundResult, ScoreInput, ScoreResult } from './types.js';

/** Every game's rules, in the order an app offers the games. */
const RULES: readonly Rules[] = [FLIP_7];

/** The games the package can score, in the order an app offers them. */
export const GAMES: readonly Game[] = RULES.map(({ id, name, rules, minPlayers, maxPlayers }) => ({
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

/** What stops the game being scored at all, if anything. */
const gameProblems = (rules: Rules, input: ScoreInput): readonly Problem[] => [
    ...(input.rules === rules.rules
        ? []
        : [
              refuse(
                  'unknown-rules',
                  `${rules.name} has no rule set with the version ${JSON.stringify(input.rules)}.`
              ),
          ]),
    ...playerProblems(rules, input.players),
    ...rules.checkOptions(input.options),
];

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

/** The rounds walked in order: each one's result, the totals, the winners and the problems. */
const walk = (
    rules: Rules,
    input: ScoreInput
): Pick<ScoreResult, 'rounds' | 'problems'> & {
    readonly totals: readonly number[];
    readonly winners: readonly number[] | null;
} => {
    const { players, rounds } = input;
    const totals = players.map(() => 0);
    const results: RoundResult[] = [];
    const problems: Problem[] = [];
    let winners: readonly number[] | null = null;
    rounds.forEach((round, index) => {
        if (winners !== null) {
            problems.push({
                code: 'after-the-end',
                message: 'The game was over before this round.',
                round: index,
                player: null,
            });
            results.push({ state: 'refused', scores: {} });
            return;
        }
        const outcome = rules.scoreRound(round, { players, index });
        problems.push(...outcome.problems);
        const complete = players.every((player) => outcome.scores.has(player));
        const refused = outcome.problems.length > 0;
        if (!refused && !complete && index < rounds.length - 1)
            problems.push({
                code: 'round-unfinished',
                message: 'A later round was entered before every player had played this one.',
                round: index,
                player: null,
            });
        const scored = complete && !refused;
        results.push({
            state: refused ? 'refused' : scored ? 'scored' : 'open',
            scores: Object.fromEntries(outcome.scores),
        });
        if (!scored) return;
        players.forEach((player, seat) => {
            totals[seat] = (totals[seat] ?? 0) + (outcome.scores.get(player) ?? 0);
        });
        winners = rules.winners(totals);
    });
    return { rounds: results, problems, totals, winners };
};

/**
 * Scores a game from everything entered so far.
 *
 * Nothing is kept between calls and nothing is read but what is passed in, so the same game
 * always gets the same answer, and changing an earlier round is scoring the game again with the
 * round changed. Whatever the rules refuse is reported in `problems` and counts toward no total.
 * A round is only added to the totals once every player's entry is in and accepted.
 */
export const score = (input: ScoreInput): ScoreResult => {
    const rules = RULES.find((candidate) => candidate.id === input.game);
    if (!rules)
        return unscored(input, [
            refuse('unknown-game', `No game has the id ${JSON.stringify(input.game)}.`),
        ]);
    const stopped = gameProblems(rules, input);
    if (stopped.length > 0) return unscored(input, stopped);
    const { players } = input;
    const { rounds, problems, totals, winners } = walk(rules, input);
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
