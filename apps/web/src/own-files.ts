/**
 * The source files that load on demand, each built into a file of its own: every screen, by its
 * route's name, and each game's round entry. The screens' loaders name them, the build keeps each
 * apart from the parts the app's screens share, and the prerender has each page fetch its own.
 * Paths are from the app's folder, as the build names its files.
 */
export const SCREEN_FILES = {
    start: 'src/website/Start.tsx',
    about: 'src/website/About.tsx',
    install: 'src/website/Install.tsx',
    play: 'src/app/PlayStart.tsx',
    new: 'src/app/NewGame.tsx',
    game: 'src/app/GameScreen.tsx',
    scores: 'src/app/ScoresScreen.tsx',
    recap: 'src/app/RecapScreen.tsx',
    history: 'src/app/HistoryScreen.tsx',
    players: 'src/app/PlayersList.tsx',
    player: 'src/app/PlayerPage.tsx',
} as const;

/** Each game's round entry, loaded for a game of that kind alone. */
export const ENTRY_FILES = {
    'flip-7': 'src/app/flip7-round.tsx',
    skyjo: 'src/app/skyjo-round.tsx',
    wizard: 'src/app/wizard-round.tsx',
} as const;

/** The app's frame, loaded with the app's first screen and kept with the parts its screens share. */
export const FRAME_FILE = 'src/app/AppFrame.tsx';

/** Every file built on its own. */
export const OWN_FILES: readonly string[] = [
    ...Object.values(SCREEN_FILES),
    ...Object.values(ENTRY_FILES),
];
