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
in the page's first draw. A tab still running an older build has to recover when a file it asks for
has gone.

## Options

**Keep one script and raise the budget as screens are added.** Nothing new to build or test, and
every move between screens is instant. Every page pays for every screen, and the cost grows with
each one.

**Split by screen with `React.lazy`.** The usual way to load a route's code on demand. The
prerender would have to move from `renderToString`, which draws the loading line of any part that
waits, to React's static prerender, which waits. A lazy component keeps a failed import for the
life of the page, so a screen whose file failed once never loads again until a reload, and its load
cannot be started and settled ahead of the draw that needs it.

**Split by screen, with a loader of our own read by React's `use`.** Each screen's `import()`
gives a promise that carries its own state, which `use` reads with no wait once it has settled. The
prerender loads every screen first and draws each page whole with `renderToString`, the page loads
its own screen before the app takes it over, a load can be started early through the same promise,
and a failed load is forgotten once the screen has said so, so the next move tries again. It leans
on React reading the state a promise carries, the convention React's own lazy components use.

## Decision

**Each screen, the app's frame and each game's round entry load on demand, through a loader read
by `use`.** `apps/web/src/screens.tsx` holds a loader for each screen and the frame, and
`apps/web/src/app/entries.ts` one for each game's entry, so a table loads Flip 7's cards, Skyjo's
pad or Wizard's bids and no other game's. `apps/web/src/own-files.ts` lists the files loaded on
demand, the screens' loaders and the prerender read it, and a test holds the entries' loaders to
it.

- **A page sends the shell and its own code.** The shell holds the router, the status line, the
  watch for a newer build and the website's frame. A page of the app adds the app's frame, the
  parts its screens share and its own screen, split into files as the bundler splits them by
  default. A page of the website adds its own page and none of the app's screens or its frame. The
  prerender has each page fetch its own files beside the shell, read from the build's manifest and
  source maps.
- **Every screen's code is loaded once the service worker serves the page,** so a move to a screen
  not yet opened draws at once, from the phone, rather than holding its loading line. The worker
  fetches every file once the first page has loaded, as it always has, so this costs no network. A
  browser with no worker loads every screen's code once the page has loaded instead.
- **A first visit, before the worker has taken the page, fetches each screen on its first open.** A
  move fetches the frame's file and the screen's together, and opening a game fetches its screen,
  its round entry and the scores, from the start screen's game in play, the new game screen and the
  game's own screen.
- **A move starts as a page load would.** Focus moves to the main region at once, as the bar names
  the new screen. A screen still loading holds its place with the kit's loading line in a region
  marked busy, a wait that outlasts the kit's loading delay is said on the status line, and focus
  moves to the screen once it draws where the move left it elsewhere. A game's round entry holds a
  place of its own inside the game's screen.
- **A screen whose file did not load** shows that it could not be shown, and, with no connection,
  that it needs one the first time it opens. With the browser online, the frame offers a reload, on
  any screen, since a newer build may have taken the file off the server and a connection that let
  it down is answered by a reload too. The failure is forgotten once said, so the next move to the
  screen loads its file afresh, and a screen that loads takes the reload away. Where the frame's own
  file or a page of the website is the one missing, the error page takes focus and its link loads
  the page afresh, and the next move tries the frame again.
- **No screen, entry or frame is imported or exported directly,** only loaded by `import()`, and a
  test fails where one is. A module that does its work as it loads, such as the install offer's
  listener, is imported by the shell, so it runs on every page.

## Consequences

- On a first visit in the local audit, the website's pages send about 96 KB to 101 KB of script
  rather than 125 KB, and the app's pages 110 KB to 116 KB. A new screen adds only its own file, to
  the pages that show it.
- A page of the app fetches several files rather than one. The audit serves the build over HTTP/2,
  as GitHub Pages does, and every file a page needs is fetched with the page, so they come down in
  one burst, which a test holds. The build first kept the parts the screens share in one file, to
  hold the count down over HTTP/1.1, which took the bundler's strict execution order and 3 KB to
  8 KB more script on every page. The bundler's own split sends less script and runs it in less
  time, so the build splits as the bundler does. The audit's model of HTTP/2 charges a file its
  bytes and no round trip of its own, so an equal paint between the two builds is no measure of
  what a file costs, and the test that every file comes in the one burst is what keeps it that way.
- The parts the screens share have no budget of their own, and each page's budget for its first
  load holds them. Pages sends a little more than the audit counts, its headers and compression
  adding about 160 bytes a file, so the budgets are a floor on what a visitor gets.
- The scoring rules stay in the shell, since the website names the games, so every page carries
  every game's rules.

## How it is tested

- `apps/web/scripts/own-files.test.ts` fails when any file of the app imports or exports a screen,
  an entry or the frame directly, and when a loader names a file the list does not.
- `apps/web/src/loader.test.ts` holds a module to loading once, a failure to waiting until the
  screen has said it, and the next ask after that to loading afresh.
- `apps/web/e2e/build.spec.ts` holds each screen and each game's round entry to a file of its own,
  every file loaded on demand to a budget of its own, and each page to fetching its own code and no
  other screen's. `apps/web/e2e/pages.spec.ts` holds every prerendered page to holding no loading
  line.
- `apps/web/e2e/split.spec.ts` holds a game to loading its own entry, a screen still loading to its
  title, loading line, axe audit, status line and focus, a missing file to the reload notice and
  to loading afresh on the next move, and a missing frame to the error page with focus on it.
  `apps/web/e2e/offline.spec.ts` opens every page and moves between screens with the connection
  off, and moves to screens not yet opened with no loading line once the worker serves the page.
- `npm run lighthouse` measures every page's first load, against one script budget for the
  website's pages and another for the app's.
