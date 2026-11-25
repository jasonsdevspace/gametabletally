# 4. Screens load on demand

**Status:** accepted

## Context

Every screen shipped in the one script, so each new screen added its code to every page. The
history, a player's record, the update offer and the rule options each cost every visit, and the
script budget was raised more than once to make room. A visitor reading the website loaded the
scorekeeper, and a phone opening the app at a table loaded the code for screens nobody opens during
a game.

The pages are drawn ahead of time and the app takes each one over, so whatever loads a screen's
code has to leave the page drawn whole, with no flash of a loading line, both in the prerender and
in the page's first draw.

## Options

**Keep one script and raise the budget as screens are added.** Nothing new to build or test, and
every move between screens is instant. Every page pays for every screen, and the cost grows with
each one.

**Split by screen with `React.lazy`.** The usual way to load a route's code on demand. A lazy
component suspends the first time it draws even when its code has arrived, so the prerender draws
its loading line in place of the screen, and the page's first draw waits a turn before the app
takes the page over.

**Split by screen, with a loader of our own read by React's `use`.** Each screen's `import()`
gives a promise that carries its own state, which `use` reads at once once it has settled. The
prerender loads every screen first and draws each page whole, and the page loads its own screen
before the app takes it over, so neither waits.

## Decision

**Each screen, the app's frame and each game's round entry load on demand, through a loader read
by `use`.** `apps/web/src/screens.tsx` holds a loader for each screen and the frame, and
`apps/web/src/app/entries.ts` one for each game's entry, so a table loads Flip 7's cards, Skyjo's
pad or Wizard's bids and no other game's. `apps/web/src/own-files.ts` lists the files loaded on
demand, and the screens' loaders, the build and the prerender all read it.

- **A page sends the shell and its own code.** The shell holds the router, the status line, the
  watch for a newer build and the website's frame. A page of the app adds the app's frame and the parts its
  screens share, in one file, and its own screen. A page of the website adds its own page and none
  of the app. The prerender has each page fetch its own files beside the shell, read from the
  build's manifest and source maps.
- **The service worker fetches every other file once the first page has loaded,** as it always
  has, and takes charge of the page, so a move never waits on the network and every screen opens
  with no connection after the first visit. No idle fetch of our own repeats it.
- **Opening a game fetches its screen, its round entry and the scores,** from the start screen's
  game in play, the new game screen and the game's own screen, for the moment before the worker has
  finished.
- **A screen still loading holds its place** with its title and the kit's loading line in a region
  marked busy, and focus moves to the screen once it draws.
- **A screen whose file did not arrive with the browser online** shows that it could not be shown,
  and the frame offers the reload into the newer version, since the build that listed the file has
  gone from the server. The failure is forgotten once said, so the next move to the screen loads
  its file afresh.
- **No screen, entry or frame is imported directly,** only by `import()`, and a test fails where
  one is. A module that does its work as it loads, such as the install offer's listener, is
  imported by the shell, so it runs on every page.

## Consequences

- The website's pages send about a fifth less script, and the app's pages a little less. A new
  screen adds only its own file, to the pages that show it.
- A page of the app fetches a few files rather than one. On a slow first visit over HTTP/1.1, as
  the local audit serves it, a page that draws from the phone's games paints its largest content
  about a sixth of a second later than the one script did. GitHub Pages serves HTTP/2, which fetches
  them at once. The parts the app's screens share are kept in one file to hold the count down,
  which takes the bundler's strict execution order and a little more script in return.
- The scoring rules stay in the shell, since the website names the games. Splitting them by game
  is a change of its own.

## How it is tested

- `apps/web/scripts/own-files.test.ts` fails when any file of the app imports a screen, an entry
  or the frame directly, and when a loader names a file the list does not.
- `apps/web/e2e/build.spec.ts` holds each file loaded on demand to a file of its own and a budget
  of its own, and each page to fetching the shell and its own code and no other screen's.
- `apps/web/e2e/split.spec.ts` holds a game to loading its own entry and fetching the scores, a
  screen still loading to its title, loading line, axe audit and focus, and a missing file to the
  reload notice. `apps/web/e2e/offline.spec.ts` opens every page and moves between screens with
  the connection off.
- `npm run lighthouse` measures every page's first load, the website's and the app's each against
  a script budget of its own.
