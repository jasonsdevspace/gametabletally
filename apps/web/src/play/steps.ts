import { isRecord, type SavedStep, type StepPart } from '../store/format.js';

/**
 * The steps of a round, each game's own, and where each step's entry goes in the round the
 * game's rules read.
 *
 * A round is entered a step at a time. Flip 7 takes each seat in turn. Skyjo takes each seat and
 * then who ended the round. Wizard takes every bid and then every count of tricks. A player out
 * of the round has no step. What an entry holds is the game's own, and the scoring package checks
 * it, so nothing here judges a value.
 */

/**
 * A round as a draft holds it: each player's entry by id, who is out, and anything the game adds.
 */
export interface DraftRound {
    readonly entries: Readonly<Record<string, unknown>>;
    readonly out: readonly string[];
    readonly [part: string]: unknown;
}

/** One game's steps. */
interface Flow {
    /** The parts of the round, in the order they are entered, for the players in it. */
    readonly steps: (playing: readonly string[]) => readonly SavedStep[];
}

const each = (part: StepPart, playing: readonly string[]): SavedStep[] =>
    playing.map((player) => ({ part, player }));

const FLOWS: Readonly<Record<string, Flow>> = {
    'flip-7': { steps: (playing) => each('entry', playing) },
    skyjo: { steps: (playing) => [...each('entry', playing), { part: 'ender', player: null }] },
    wizard: { steps: (playing) => [...each('bid', playing), ...each('tricks', playing)] },
};

/** Whether the app knows how a game's round is entered. */
export const knowsGame = (game: string): boolean => Object.hasOwn(FLOWS, game);

/** A round with nothing entered and nobody out. */
export const emptyRound = (): DraftRound => ({ entries: {}, out: [] });

/** Reads a saved round as a draft holds it, keeping whatever else it carries. */
export const toDraftRound = (round: unknown): DraftRound => {
    const record = isRecord(round) ? round : {};
    const entries = record['entries'];
    const out = record['out'];
    return {
        ...record,
        entries: isRecord(entries) ? entries : {},
        out: Array.isArray(out) ? out.filter((id): id is string => typeof id === 'string') : [],
    };
};

/** The players in a round, in seat order: everyone but those it names as out. */
export const playingIn = (players: readonly string[], round: DraftRound): string[] =>
    players.filter((player) => !round.out.includes(player));

/** A round's steps, in order, for the players in it. */
export const stepsOf = (
    game: string,
    players: readonly string[],
    round: DraftRound
): readonly SavedStep[] => FLOWS[game]?.steps(playingIn(players, round)) ?? [];

/** Whether two steps are the same step. */
export const sameStep = (first: SavedStep | null, second: SavedStep | null): boolean =>
    first?.part === second?.part && first?.player === second?.player;

/** An entry as a record, or an empty one where there is none yet. */
const entryOf = (round: DraftRound, player: string): Readonly<Record<string, unknown>> => {
    const entry = round.entries[player];
    return isRecord(entry) ? entry : {};
};

/**
 * The round with a step's entry written in. A bid and its tricks share the player's entry, so
 * each keeps the other. A player's entry written as nothing is taken out, as a total typed and
 * then deleted is, since the rules refuse an entry that holds nothing, and an ender written as
 * nothing is no one.
 */
export const write = (
    round: DraftRound,
    { part, player }: SavedStep,
    value: unknown
): DraftRound => {
    if (part === 'ender') return { ...round, ender: value ?? null };
    if (player === null) return round;
    if (part === 'entry' && value === undefined) {
        const { [player]: _taken, ...entries } = round.entries;
        return { ...round, entries };
    }
    const entry =
        part === 'bid'
            ? { ...entryOf(round, player), bid: value }
            : part === 'tricks'
              ? { ...entryOf(round, player), tricks: value }
              : value;
    return { ...round, entries: { ...round.entries, [player]: entry } };
};

/** What a step holds in the round, or undefined when nothing is entered for it yet. */
export const read = (round: DraftRound, { part, player }: SavedStep): unknown => {
    if (part === 'ender') return round['ender'] ?? undefined;
    if (player === null || !Object.hasOwn(round.entries, player)) return undefined;
    if (part === 'bid') return entryOf(round, player)['bid'] ?? undefined;
    if (part === 'tricks') return entryOf(round, player)['tricks'] ?? undefined;
    return round.entries[player];
};

/**
 * The round with the players named as out, in seat order, and with what they had entered and any
 * claim that one of them ended it taken out, since nobody out of a round has a part in it.
 */
export const withOut = (
    round: DraftRound,
    players: readonly string[],
    out: readonly string[]
): DraftRound => {
    const seated = players.filter((player) => out.includes(player));
    const entries = Object.fromEntries(
        Object.entries(round.entries).filter(([player]) => !seated.includes(player))
    );
    const ender = round['ender'];
    const keep = typeof ender === 'string' && seated.includes(ender) ? { ender: null } : {};
    return { ...round, entries, out: seated, ...keep };
};

/**
 * Whether two values hold the same, as JSON would write them, whatever order their fields are in.
 */
export const sameValue = (first: unknown, second: unknown): boolean => {
    if (Array.isArray(first) || Array.isArray(second))
        return (
            Array.isArray(first) &&
            Array.isArray(second) &&
            first.length === second.length &&
            first.every((item, at) => sameValue(item, second[at]))
        );
    if (isRecord(first) && isRecord(second)) {
        const keys = new Set([...Object.keys(first), ...Object.keys(second)]);
        return [...keys].every((key) => sameValue(first[key] ?? null, second[key] ?? null));
    }
    return first === second;
};
