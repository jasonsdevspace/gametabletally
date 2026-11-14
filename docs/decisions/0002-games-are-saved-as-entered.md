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
played, the version of its rule set, its options, its players in seat order, every round saved, the
round being entered as its draft, and when it was started and last changed. A game in play and a
finished one are saved alike, and whether it is over is worked out from its rounds.

- **The round being entered is saved beside the rounds, never among them.** A game's draft holds
  the round's place, what is entered so far and the step it is at, so a page closed in the middle
  of a round opens again at the same step with the same entry. A hand half entered is never among
  the rounds, since the scoring package would read it as a whole one and could end a game on a
  player's first tap. Saving the round moves the draft into the rounds, whole, and a reopened
  round leaves the saved one as it was until its draft is saved. The draft came into version 1 of
  the shape rather than a new version, since no build had saved a game before it.
- **Each thing the store does is one transaction, reads and writes together.** A game is saved
  again after every entry, whole, so a page closed in the middle of a round leaves the game as it
  was after the last entry. A merge of a file reads what is on the phone and writes in the same
  transaction, so an entry saved while a file is merged is weighed against the file's copy and
  never lost under it, and the merge lands whole or not at all. Removing a player reads the games
  in the transaction that removes them, so a game saved in between cannot name a deleted player.
- **Everything is checked both ways.** A player or a game that is not one is refused when it is
  saved, so nothing is written that could not be read back. A record already in the database that
  is not one is passed over when the records are read, and counted, so a page can say a backup is
  not whole. A file with such a record is refused.
- **Dates and times are saved in one form and compared as moments,** UTC and ending in Z, so a
  merge keeps the later of two copies however finely each wrote its time.
- **The saved shape has a version,** which is the database's version and a field of the file. A
  file from a newer version is refused whole, with a sentence that says to update the app, and so
  is a database a newer build has already upgraded. An open tab lets go of the database when a
  newer build asks to upgrade it, so the upgrade is not kept waiting.
- **A removed player who has played is kept and marked,** so a finished game still says who
  played it. A game names its players by id, and a name is looked up when it is shown.
- **The store can ask the browser to keep its storage,** since a browser may clear a site's data
  when the phone runs low and passes over a site that has asked.

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
  it. Two phones changing one game is rare with no sync, and the later clock wins.
- A merge deletes nothing, so a game deleted on one phone returns from a file that still holds
  it.
- The parts a step can be are part of the saved shape, so a game whose round is entered in a part
  no other game has is a new version of it.

## How it is tested

- `apps/web/src/store/store.test.ts` runs the store against an IndexedDB in memory that has the
  real one's transactions and versions. A game is there after the database is opened again, and a
  game opened again scores as it did when it was saved. A merge adds no game twice, keeps the
  later copy however finely each wrote its time, and changes nothing when one record cannot be
  saved. A player or a game that is not one is refused. A record planted in the database that is
  not one is passed over, counted and left out of a file, and still keeps the player it names. A
  database upgraded by a newer build is refused with the sentence a page shows, an open store lets
  go when a newer build asks, and a connection that does not is reported. The answer to asking the
  browser to keep its storage is passed on.
- `apps/web/src/store/format.test.ts` holds a saved game to its fields, with no total among them,
  holds the readers to each rule a field has, a draft's included, holds the scoring input to the
  saved rounds and never the draft, and holds the file's reader to refusing a newer file, a record
  twice and anything that is not a file of saved games.
- `apps/web/src/play/play.test.ts` plays a game of each kind through the module alone and holds a
  round half entered to scoring nothing and ending no game. A game opens again at the same round,
  player and entry, a Wizard round is saved between its bids and its tricks, and a reopened round
  left without saving changes no saved round.
- A database on a real disk that outlives a closed tab is not proven by these tests, which run in
  memory.
