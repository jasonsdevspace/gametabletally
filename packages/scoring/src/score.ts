import { FLIP_7 } from './flip-7.js';
import {
    bestAmong,
    contenders,
    FEWEST_IN_ROUND,
    isRecord,
    isWhole,
    plain,
    problemAt,
    type Refusal,
    refusal,
    type Rules,
    type Settled,
} from './rules.js';
import { SKYJO } from './skyjo.js';
import type {
    Game,
    GameOption,
    OptionValue,
    Problem,
    ProblemData,
    RoundResult,
    ScoreInput,
    ScoreResult,
} from './types.js';
import { WIZARD } from './wizard.js';

/**
 * Every rule set of every game, in the order an app offers the games. A game whose rules change
 * keeps its earlier versions here, so a game saved under one is still scored by it.
 */
export const RULES: readonly Rules[] = [FLIP_7, SKYJO, WIZARD];

/** The newest rule set of each game, in the order an app offers them. */
const NEWEST: readonly Rules[] = RULES.filter(
    (rules) => !RULES.some((other) => other.id === rules.id && other.rules > rules.rules)
);

/** The games the package can score, in the order an app offers them. */
export const GAMES: readonly Game[] = NEWEST.map(
    ({ id, name, rules, ahead, minPlayers, maxPlayers, options }) => ({
        id,
        name,
        rules,
        ahead,
        minPlayers,
        maxPlayers,
        options,
    })
);

/** What is not a game, naming the part it lacks where it lacks one. */
const notGame = (
    message: string,
    part?: Extract<ProblemData['not-a-game'], { part: unknown }>['part']
): Refusal => refusal('not-a-game', message, part === undefined ? {} : { part });

/**
 * Reads a game as handed over, or says what it lacks. A caller in another language passes text
 * no type checker saw, so nothing about its shape is taken on trust.
 */
const readInput = (raw: unknown): ScoreInput | Refusal => {
    if (!isRecord(raw)) return notGame('The game is not an object.');
    const { game, rules, options, players, rounds } = raw;
    if (typeof game !== 'string')
        return notGame('The game does not name which game it is.', 'game');
    if (!isWhole(rules))
        return notGame('The game does not name the version of its rule set.', 'rules');
    if (!isRecord(options)) return notGame('The game does not hold its options.', 'options');
    if (!Array.isArray(players)) return notGame('The game does not list its players.', 'players');
    const ids = players.filter((id): id is string => typeof id === 'string' && id !== '');
    if (ids.length !== players.length) return notGame('A player is not named by an id.', 'players');
    if (!Array.isArray(rounds)) return notGame('The game does not list its rounds.', 'rounds');
    return { game, rules, options, players: ids, rounds };
};

/** What is wrong with the list of players, if anything. */
const playerProblems = (rules: Rules, players: readonly string[]): readonly Problem[] => {
    const given = players.length;
    const count: Refusal[] = [];
    if (given < rules.minPlayers)
        count.push(
            refusal('too-few-players', `${rules.name} takes ${rules.minPlayers} players or more.`, {
                min: rules.minPlayers,
                given,
            })
        );
    if (rules.maxPlayers !== null && given > rules.maxPlayers)
        count.push(
            refusal(
                'too-many-players',
                `${rules.name} takes ${rules.maxPlayers} players or fewer.`,
                { max: rules.maxPlayers, given }
            )
        );
    // Each player listed more than once is named once, in seat order, so one pass fixes them all.
    const twice = players.filter(
        (player, seat) =>
            players.indexOf(player) !== seat && players.indexOf(player, seat + 1) === -1
    );
    return [
        ...count.map((problem) => problemAt(problem)),
        ...twice.map((player) =>
            problemAt(refusal('player-twice', 'A player is in the game twice.', {}), null, player)
        ),
    ];
};

/** Whether an option takes a value: one of its numbers, or on or off. */
const allows = (option: GameOption, value: unknown): value is OptionValue =>
    option.kind === 'number'
        ? option.values.some((allowed) => allowed === value)
        : typeof value === 'boolean';

/** Why a value an option does not take is refused, naming the value where it can be written. */
const notAllowed = (rules: Rules, option: GameOption, value: unknown): Refusal => {
    const given = plain(value);
    const what = given === null ? 'take the value given' : `be ${JSON.stringify(given)}`;
    return refusal('value-not-allowed', `${option.name} cannot ${what} in ${rules.name}.`, {
        option: option.id,
        value: given,
    });
};

/**
 * What is wrong with the options a game is given, if anything: each one the game does not have,
 * and each value an option does not allow, sorted by id, since the order an object's keys come in
 * is one runtime's own. An option given as null is one not given, whatever its id, as a part is
 * anywhere else.
 */
const optionProblems = (
    rules: Rules,
    options: Readonly<Record<string, unknown>>
): readonly Problem[] =>
    Object.keys(options)
        .sort()
        .flatMap((id) => {
            const value = options[id] ?? null;
            if (value === null) return [];
            const option = rules.options.find((declared) => declared.id === id);
            if (!option)
                return [
                    problemAt(
                        refusal(
                            'unknown-option',
                            `${rules.name} has no option named ${JSON.stringify(id)}.`,
                            { option: id }
                        )
                    ),
                ];
            return allows(option, value) ? [] : [problemAt(notAllowed(rules, option, value))];
        });

/**
 * The switches given on together that cannot be, each pair once, in the order the game declares
 * them, so a game is never played by two rules on the same thing.
 */
const clashProblems = (rules: Rules, options: Settled): readonly Problem[] => {
    // Read from the settled options, defaults filled in, so a switch on by default clashes as one
    // given on does.
    const on = rules.options.filter(
        (option) => option.kind === 'switch' && options[option.id] === true
    );
    return on.flatMap((option, at) =>
        on
            .slice(at + 1)
            .filter(
                (other) =>
                    (option.kind === 'switch' && (option.excludes ?? []).includes(other.id)) ||
                    (other.kind === 'switch' && (other.excludes ?? []).includes(option.id))
            )
            .map((other) =>
                problemAt(
                    refusal(
                        'options-clash',
                        `${option.name} and ${other.name} cannot both be on in ${rules.name}.`,
                        { options: [option.id, other.id] }
                    )
                )
            )
    );
};

/** The game's options as it is played, with the published rule's for each one not given. */
const settle = (rules: Rules, options: Readonly<Record<string, unknown>>): Settled =>
    Object.fromEntries(
        rules.options.map((option) => {
            const given = options[option.id];
            return [option.id, allows(option, given) ? given : option.default];
        })
    );

/**
 * The players ahead on the totals, in seat order, among those who have missed no round, or among
 * everyone when every player has missed one.
 */
const ahead = (
    rules: Rules,
    players: readonly string[],
    totals: readonly number[],
    missed: readonly boolean[]
): string[] => {
    return bestAmong(totals, contenders(missed), rules.ahead).flatMap(
        (seat) => players[seat] ?? []
    );
};

/**
 * The winners a game's rules name, held to the players who can win. Each game picks among them
 * itself, and this keeps a game that forgot from naming a player who missed a round while another
 * missed none. A game whose winners were all of those goes on.
 */
const amongContenders = (
    winners: readonly number[] | null,
    missed: readonly boolean[]
): readonly number[] | null => {
    if (winners === null) return null;
    const seats = contenders(missed);
    const held = winners.filter((seat) => seats.includes(seat));
    return held.length > 0 ? held : null;
};

/** The answer for a game nothing could be scored in. */
const unscored = (input: ScoreInput, problems: readonly Problem[]): ScoreResult => ({
    game: input.game,
    rules: input.rules,
    state: 'in-play',
    rounds: input.rounds.map(() => ({ state: 'skipped', scores: {}, out: [] })),
    totals: Object.fromEntries(input.players.map((player) => [player, 0])),
    leaders: [...input.players],
    winners: [],
    missed: [],
    problems,
});

/** What walking the rounds comes to. */
interface Walked {
    readonly rounds: readonly RoundResult[];
    readonly problems: readonly Problem[];
    /** Each player's total, in seat order. */
    readonly totals: readonly number[];
    /** Whether each player has been out of a scored round, in seat order. */
    readonly missed: readonly boolean[];
    /** Who has won, as places in the seat order, or null while the game goes on. */
    readonly winners: readonly number[] | null;
}

/** A round that is never read, for a reason outside it. */
const passedOver = (walked: Walked, problem: Problem): Walked => ({
    ...walked,
    rounds: [...walked.rounds, { state: 'skipped', scores: {}, out: [] }],
    problems: [...walked.problems, problem],
});

/** Who a round names as out of it, in seat order, and what is wrong with the list. */
interface ReadOut {
    readonly out: readonly string[];
    readonly problems: readonly Problem[];
}

/**
 * Reads the players a round names as out of it, which any game's round may. A list given as
 * null, or not given, names nobody. An id for nobody in the game is refused, sorted by id, and
 * then each player named more than once, once, in seat order.
 */
const readOut = (round: unknown, players: readonly string[], index: number): ReadOut => {
    const listed = isRecord(round) ? (round['out'] ?? undefined) : undefined;
    if (listed === undefined) return { out: [], problems: [] };
    // Copied first, so a hole in the list is read as nothing given and refused, as a player is.
    const items: readonly unknown[] = Array.isArray(listed) ? Array.from(listed) : [];
    if (!Array.isArray(listed) || !items.every((id): id is string => typeof id === 'string'))
        return {
            out: [],
            problems: [
                problemAt(
                    refusal('not-a-round', 'The round does not list its players out by id.', {
                        part: 'out',
                    }),
                    index
                ),
            ],
        };
    const ids = items.filter((id): id is string => typeof id === 'string');
    const unknown = [...new Set(ids.filter((id) => !players.includes(id)))].sort();
    const twice = players.filter((player) => ids.indexOf(player) !== ids.lastIndexOf(player));
    return {
        out: players.filter((player) => ids.includes(player)),
        problems: [
            ...unknown.map((id) =>
                problemAt(
                    refusal('unknown-out', 'The round names as out somebody not in the game.', {}),
                    index,
                    id
                )
            ),
            ...twice.map((player) =>
                problemAt(
                    refusal('out-twice', 'The round names a player as out more than once.', {}),
                    index,
                    player
                )
            ),
        ],
    };
};

/** Who is in a round and who is out of it, and what is wrong with either. */
interface Seated extends ReadOut {
    /** The players in the round, in seat order. */
    readonly playing: readonly string[];
}

/**
 * Who a round is played by: everyone but the players it names as out. A table that loses players
 * carries on while two are left, whatever the game takes to start, and a round with fewer is
 * refused.
 */
const seat = (round: unknown, players: readonly string[], index: number): Seated => {
    const named = readOut(round, players, index);
    const playing = players.filter((player) => !named.out.includes(player));
    if (playing.length >= FEWEST_IN_ROUND) return { ...named, playing };
    const tooFew = refusal(
        'too-few-in-round',
        `A round takes ${FEWEST_IN_ROUND} players in it or more.`,
        { min: FEWEST_IN_ROUND, given: playing.length }
    );
    return { ...named, playing, problems: [...named.problems, problemAt(tooFew, index)] };
};

/** A game being scored: its rules, the game as handed over, and its options as it is played. */
interface Playing {
    readonly rules: Rules;
    readonly input: ScoreInput;
    readonly options: Settled;
}

/**
 * The game with one more round read.
 *
 * A round counts toward the totals only when every round before it does. One entered behind a
 * round that is unfinished or refused is passed over, so no game is called over, and nobody the
 * winner, on totals with a round missing from them.
 */
const step = ({ rules, input, options }: Playing, walked: Walked, index: number): Walked => {
    if (walked.winners !== null)
        return passedOver(
            walked,
            problemAt(refusal('after-the-end', 'The game was over before this round.', {}), index)
        );
    if (walked.rounds.some(({ state }) => state !== 'scored'))
        return passedOver(
            walked,
            problemAt(refusal('after-a-gap', 'An earlier round has yet to be scored.', {}), index)
        );
    const { players, rounds } = input;
    const round = rounds[index];
    const seated = seat(round, players, index);
    const { out, playing } = seated;
    // A round whose players out are wrong, or too few, is read no further: who is in it is not
    // settled, so nothing in it can be scored, or doubled, for anyone.
    const read =
        seated.problems.length === 0
            ? rules.scoreRound(round, {
                  seats: players,
                  totals: new Map(
                      players.map((player, seat) => [player, walked.totals[seat] ?? 0])
                  ),
                  players: playing,
                  out,
                  index,
                  options,
              })
            : { scores: new Map<string, number>(), problems: [], complete: false };
    const outcome = { ...read, problems: [...seated.problems, ...read.problems] };
    const complete = read.complete && outcome.problems.length === 0;
    // The last round may still be in play. One with a round entered after it may not.
    const unfinished = !complete && outcome.problems.length === 0 && index < rounds.length - 1;
    const problems = unfinished
        ? [
              problemAt(
                  refusal(
                      'round-unfinished',
                      'A later round was entered before this one was played out.',
                      {}
                  ),
                  index
              ),
          ]
        : outcome.problems;
    // A complete round has no problems, so it is never unfinished: it is the round scored.
    const scored = complete;
    // A player out of a scored round scores nothing for it, which is not a score of zero.
    const totals = scored
        ? walked.totals.map((total, seat) => total + (outcome.scores.get(players[seat] ?? '') ?? 0))
        : walked.totals;
    const missed = scored
        ? walked.missed.map((before, seat) => before || out.includes(players[seat] ?? ''))
        : walked.missed;
    return {
        rounds: [
            ...walked.rounds,
            {
                state: scored ? 'scored' : problems.length > 0 ? 'refused' : 'open',
                scores: Object.fromEntries(outcome.scores),
                out,
            },
        ],
        problems: [...walked.problems, ...problems],
        totals,
        missed,
        // Every round before this one was scored, so the count is this round's place plus one.
        winners: scored
            ? amongContenders(rules.winners({ totals, missed, rounds: index + 1, options }), missed)
            : null,
    };
};

/** A game whose shape has been read, scored. */
const scoreRead = (input: ScoreInput): ScoreResult => {
    const known = RULES.filter(({ id }) => id === input.game);
    if (known.length === 0)
        return unscored(input, [
            problemAt(
                refusal('unknown-game', `No game has the id ${JSON.stringify(input.game)}.`, {
                    game: input.game,
                })
            ),
        ]);
    const rules = known.find((candidate) => candidate.rules === input.rules);
    if (!rules)
        return unscored(input, [
            problemAt(
                refusal(
                    'unknown-rules',
                    `The game has no rule set with the version ${input.rules}.`,
                    {
                        rules: input.rules,
                    }
                )
            ),
        ]);
    const { players } = input;
    const given = optionProblems(rules, input.options);
    const stopped = [
        ...playerProblems(rules, players),
        ...given,
        ...(given.length === 0 ? clashProblems(rules, settle(rules, input.options)) : []),
    ];
    if (stopped.length > 0) return unscored(input, stopped);
    const playing: Playing = { rules, input, options: settle(rules, input.options) };
    const start: Walked = {
        rounds: [],
        problems: [],
        totals: players.map(() => 0),
        missed: players.map(() => false),
        winners: null,
    };
    const { rounds, problems, totals, missed, winners } = input.rounds.reduce<Walked>(
        (walked, _, index) => step(playing, walked, index),
        start
    );
    return {
        game: rules.id,
        rules: rules.rules,
        state: winners === null ? 'in-play' : 'over',
        rounds,
        totals: Object.fromEntries(players.map((player, seat) => [player, totals[seat] ?? 0])),
        leaders: ahead(rules, players, totals, missed),
        winners: (winners ?? []).flatMap((seat) => players[seat] ?? []),
        missed: players.filter((_, seat) => missed[seat] === true),
        problems,
    };
};

/** The answer for something that is not a game at all. */
const notAGame = (problem: Refusal): ScoreResult => ({
    game: '',
    rules: 0,
    state: 'in-play',
    rounds: [],
    totals: {},
    leaders: [],
    winners: [],
    missed: [],
    problems: [problemAt(problem)],
});

/** Scores whatever is handed over, which may not be a game. */
const scoreAny = (raw: unknown): ScoreResult => {
    const input = readInput(raw);
    return 'code' in input ? notAGame(input) : scoreRead(input);
};

/**
 * Scores a game from everything entered so far.
 *
 * Nothing is kept between calls and nothing is read but what is passed in, so the same game
 * always gets the same answer, and changing an earlier round is scoring the game again with the
 * round changed. Whatever the rules refuse is reported in `problems` and counts toward no total.
 * A round is added to the totals once it is whole, which is the entry of every player in it in and
 * accepted with whatever else the game needs of a round, and only when every round before it has
 * been. It does not throw, whatever it is given.
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
        return JSON.stringify(
            notAGame(refusal('not-json', 'The game is not written as JSON.', {}))
        );
    }
    return JSON.stringify(scoreAny(raw));
};
