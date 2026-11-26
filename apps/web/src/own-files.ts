/**
 * The source files that load on demand: every screen, by its route's name, each game's round entry
 * and the app's frame. The screens' loaders name them, the prerender has each page fetch its own,
 * and the tests hold each screen and entry to a file of its own, which the bundler gives each one
 * loaded by `import()`. Paths are from the app's folder, as the build names its files.
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

/** The app's frame, loaded with the app's first screen. */
export const FRAME_FILE = 'src/app/AppFrame.tsx';

/** Every file built on its own. */
export const OWN_FILES: readonly string[] = [
    ...Object.values(SCREEN_FILES),
    ...Object.values(ENTRY_FILES),
];
