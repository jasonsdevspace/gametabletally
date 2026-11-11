# 2. Games are saved as they were entered, in IndexedDB

**Status:** accepted

## Context

A game has to outlast a closed tab, a locked phone and an update of the app, with no account and
no server to hold it. What is saved is also what a backup holds, what a later sync sends, and what
a phone app in another language will read, so its shape is a contract from the first release.

Two things had to be chosen: where on the phone the games are kept, and what a saved game holds.

## Options

### Where

**Local storage.** One line to write and to read, with no upgrade to manage. It holds text only, a
few megabytes of it, and writing blocks the page, so a long history is written whole on every
entry, on the thread that draws the screen.

**IndexedDB.** A database in the browser, with stores of records, transactions and versions. Its
interface is callbacks and events, so it needs a small module in front of it. It holds far more,
writes off the drawing thread, and saves a change whole or not at all.

**The file system the browser gives a site.** Private files with fast access, suited to large
binary data. A list of games is small records, and reading and merging them would be written by
hand.

### What a game holds

**The entries and the totals.** A history page reads a total straight from the record. Two things
then say what a game scored, and a corrected rule or an edited round leaves the saved total
wrong, with nothing to say which of the two is right.

**The entries alone.** The scoring package works the totals out whenever they are shown. A page
that lists many games scores each one to show its winner.

## Decision

**IndexedDB, behind one module, holding each game as it was entered and no total.**

`apps/web/src/store` is the only code that touches the database. It opens it, saves a player or a
game, lists them, and reads and writes the one file a backup is. A game holds its id, the game
played, the version of its rule set, its options, its players in seat order, every round entered,
and when it was started and last changed. A game in play and a finished one are saved alike, and
whether it is over is worked out from its rounds.

- **A change is one transaction.** A game is saved again after every entry, whole, so a page
  closed in the middle of a round leaves the game as it was after the last entry. A merge of a
  file is one transaction over players and games, so it lands whole or not at all.
- **Everything read is checked.** A record that is not a player or a game is passed over when the
  database is read and refuses the file when a file is read, so a damaged record cannot reach a
  screen as something it is not.
- **The saved shape has a version,** which is the database's version and a field of the file. A
  file from a newer version is refused whole, with a sentence that says to update the app.
- **A removed player who has played is kept and marked,** so a finished game still says who
  played it. A game names its players by id, and a name is looked up when it is shown.
- **The app asks the browser to keep its storage,** since a browser may clear a site's data when
  the phone runs low and passes over a site that has asked.

## Consequences

- A page that lists games scores each one it shows. Scoring is a pure function over a few rounds
  and costs little, and the result can be held in memory while a page is open.
- A stat is always worked out from the games, so it cannot drift from them, and it changes the
  right way when a rule set is corrected.
- The module in front of the database is code a line of local storage would not need, and a
  change to the saved shape is an upgrade, a reader for the older file and a test.
- A browser can still clear the data of a site it was not asked to keep, or one whose user clears
  it. The exported file is the backup until there is sync.
- A merge keeps the later copy of a game by the time each was changed, as each phone's clock told
  it. Two phones changing one game is rare with no sync, and is settled properly when sync is
  built.

## How it is tested

- `apps/web/src/store/store.test.ts` runs the store against an IndexedDB in memory that has the
  real one's transactions and versions: a game is there after the database is opened again, a
  game opened again scores as it did when it was saved, a merge adds no game twice, and a merge
  with one record the database cannot take changes nothing.
- `apps/web/src/store/format.test.ts` holds a saved game to its fields, with no total among them,
  and holds the reader to refusing a newer file and anything that is not a file of saved games.
- What only a real browser has, a database on a disk that outlives a closed tab, is for the
  browser tests that come with the app's first pages.
