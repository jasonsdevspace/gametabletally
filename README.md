# Game Table Tally

A scorekeeper for the game table. One phone is passed around, each player's round is entered with
a few taps, and the app applies the game's scoring rules, keeps the running totals and says who is
ahead. After the first visit it works with no connection, and games and players are saved on the
phone.

It is for card games people already own, and it is being built in the open. A game of Flip 7,
Skyjo or Wizard can be kept from its first round to its recap, with a player skipped for a round, a
game left to finish later, and a saved round changed afterward. A Skyjo total is typed on a number
pad or added up from the cards, and the app doubles the score of a player who ended a round without
the lowest score alone. A round of Wizard takes every bid on one screen, shows them through the
hand with who deals, and takes every player's tricks after it, saved once they add up.

It is live at [gametabletally.com](https://gametabletally.com), and installs from there to a
phone's home screen.

## Working on it

How to contribute is in [CONTRIBUTING.md](CONTRIBUTING.md), and how to report a security issue is
in [SECURITY.md](SECURITY.md).

You need [Node.js 24](https://nodejs.org/) and Git. The version is in `.nvmrc`, so `nvm use` picks it.

```bash
npm ci
npm run dev
npm run verify
```

`npm run dev` serves the app with its changes as they are saved. `npm run verify` runs what CI
runs on every pull request: the type check, the lint rules, the formatting, a prose check, a check
that everything names the Node version in `.nvmrc`, the tests, the build, and the scoring cases run
against the built script in a runtime that is not Node.

- `packages/scoring` is `@gametabletally/scoring`, the games' scoring rules with no dependencies.
  Its [README](packages/scoring/README.md) says how a game is scored and how the rules are held
  to cases.
- `apps/web` is the app, which reads the scoring package from its source, so nothing needs
  building first. It keeps players and games on the phone in the shape
  [docs/saved-games.md](docs/saved-games.md) describes, and the about page saves them to a file in
  that shape and restores from one. Its addresses are one list in
  `apps/web/src/routes.ts`, and the build writes each as a page drawn ahead of time, so every
  address reads with no script, with `404.html` for any other path, as GitHub Pages serves it.
  The app installs from its manifest, and its service worker, built from `apps/web/worker`,
  caches every file of the build on the first visit and answers every page from that cache after,
  so the app opens with no connection. A newer build's worker installs and waits for the visitor
  to take it.
  It is drawn from [`@jasonsdevspace/design-kit`](https://www.npmjs.com/package/@jasonsdevspace/design-kit)
  with the kit's colors as they are. `apps/web/src/styles/app.css` lays the app's typeface, the
  lip under a key and the grounds of the games over the kit,
  `apps/web/src/styles/website.css` lays out the website's pages and sets their display serif,
  and `apps/web/src/styles/screens.css` lays out what the screens for keeping score hold inside
  the kit's app frame and tab bar.

Two more checks run in CI beside `verify`, each building the app first:

```bash
npx playwright install chromium
npm run e2e
npm run lighthouse
```

`npm run e2e` runs the browser tests on a desktop and a phone profile, against the built files
served as GitHub Pages serves them: every address with no script, the not-found page and its 404,
an axe audit and a target size check of each page, the move between screens, the start screen's
game in play and its tab bar, a game of each kind started from the new game screen, a player
added, renamed and removed with Undo, a backup saved in one browser and restored in another, and
every address opening with the connection off after one visit. Service workers are blocked in every
browser test but those of the worker, so no other test reads a cached page. `npm run lighthouse`
holds every page to a hundred for accessibility, and the website's pages, the start screen, the new
game screen, a page about one game and the not-found page to ninety for performance, a good largest
paint and layout shift, and a budget for the script and style each carries.

A merge to main is built and deployed to GitHub Pages at gametabletally.com once every check has
passed, and a merge that fails one is not deployed. The live address counts page views with
[Plausible](https://plausible.io/), with no cookie, nothing stored on the phone and no count for a
browser that sends Global Privacy Control. A page is sent by its path alone, so the id of a game or
a player never leaves the phone, and no other address, a local build or a test among them, is
counted.

Installing sets up two hooks: one lints and formats the staged files, and one holds each commit
message to the house style. Pull requests are squashed, so a pull request's title becomes the
commit on main, and CI holds the title and the body to the same check.

The choices with a real alternative are written down under [docs/decisions](docs/decisions/README.md).

## Names and trademarks

Game Table Tally is not affiliated with, endorsed by or sponsored by the publishers of the games it
keeps score for. Flip 7, Skyjo and Wizard are trademarks of their owners and are named only to say
which games the app can score. It holds none of their artwork, cards or rule books.

## License

The code is under the [MIT License](LICENSE). The app's typefaces, DM Sans and Instrument Serif,
are each under the SIL Open Font License, with the license texts in
`apps/web/public/fonts/dm-sans-OFL.txt` and `apps/web/public/fonts/instrument-serif-OFL.txt`. The
name Game Table Tally, its logo and the gametabletally.com domain are not covered by these licenses,
and all rights to them are reserved.
