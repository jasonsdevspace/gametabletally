/** A case as a file of cases holds it. */
export interface PinnedCase {
    readonly name: string;
    readonly input?: unknown;
    readonly text?: string;
    readonly expect: {
        readonly rounds: readonly { readonly state: string }[];
        readonly problems: readonly { readonly code: string; readonly round: number | null }[];
    };
}

/** A file of cases for one version of a game's rule set. */
export interface PinnedFile {
    readonly game: string;
    readonly rules: number;
    readonly cases: readonly PinnedCase[];
}

/** One case's pin. */
export interface Pin {
    readonly name: string;
    readonly input: string;
    readonly answer: string;
    readonly liftable: boolean;
}

/** The answers one version of a game's rule set was released with. */
export interface Pins {
    readonly game: string;
    readonly rules: number;
    readonly answers: readonly Pin[];
}

export declare const inputOf: (one: PinnedCase) => string;
export declare const answerOf: (one: PinnedCase) => string;
export declare const liftable: (expect: PinnedCase['expect']) => boolean;
export declare const pinOf: (one: PinnedCase) => Pin;
export declare const breaks: (pinned: Pins, file: PinnedFile) => string[];
export declare const unpinned: (pinned: Pins, file: PinnedFile) => string[];
export declare const pinned: (before: Pins, file: PinnedFile) => Pins;
