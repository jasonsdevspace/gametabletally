# 1. Scoring runs on the phone, and a server only checks it

**Status:** accepted

## Context

The app keeps score at a table, which is often a place with no signal: a cabin, a basement, a
campsite. Version one is a web app on one phone with no server at all. Later come a server, for
sync and for play across phones, and apps for iOS and Android written in Swift and Kotlin in
repositories of their own. Each of those has to score a game the same way, down to the round a
game ends in, or a game that moves between them changes its totals on the way.

The scoring rules are the part most likely to be wrong and the part players argue about, so
there should be one place they are written and one way to prove a second place agrees with it.

## Options

**Score on a server, and have every app ask it.** One implementation, in one language. Every
entry waits on the network, and a table with no signal cannot keep score at all, which is the one
thing the app is for. The web app already works with no connection, so the phone apps would be a
step back from it.

**Write the rules again in each language.** Each app scores on the phone in its own language, with
nothing to bridge. Every game is then written three times, and the three drift apart wherever no
test happens to look.

**Write the rules in Kotlin and compile them for each platform.** One implementation that reaches
Android, iOS and JavaScript. It gives up a plain TypeScript package the web app and a server import
as it is, and it puts a toolchain in the web app's build that nothing else here uses.

**Write the rules once in TypeScript, as a function from data to data, and run that everywhere.**
The web app imports the package. A server runs the same package to check a game it is sent. A
phone app loads the package as one script into a script runtime, which iOS ships and Android can
bundle, and passes a game in and reads the answer out as text. Where that bridge is not wanted, a
game can be written again in the app's language and held to the same cases.

## Decision

**The rules are written once in TypeScript and run on the phone. A server only checks.**
`@gametabletally/scoring` exports one function, `score`, that takes a game as plain data, which is
the game's id, the version of its rule set, its options, the players and every round entered, and
returns plain data: each round's scores, the totals, who is ahead, whether the game is over and who
won, and everything the rules refused with the reason.

What makes that hold:

- **Everything in and out survives being written as JSON,** so a caller in any language hands a game
  over as text, which `scoreJson` takes and answers in. A round is read and checked as it arrives,
  so a caller with no type checker is told what is wrong with a game or a round and never gets a
  wrong total for it. Nothing handed over makes the function throw.
- **The function keeps nothing and reads nothing but what it is passed.** No clock, no locale, no
  random number. The same game always gets the same answer.
- **A round counts only when every round before it is entered in full and accepted.** One entered
  behind a round that is unfinished or refused is skipped, and says so with a state of its own, so
  no game is called over on totals with a round missing and a screen can tell a round with something
  wrong in it from one that another round holds up.
- **Scores are worked out from every round entered, never by adding a round to a kept total.**
  Changing or taking back an earlier round is scoring the game again, so there is no total to
  repair.
- **Whole numbers only,** so no two runtimes round a total differently.
- **A rule set has a version, which a game names.** A saved game is scored under the rules it was
  played by, and one naming a version the package does not hold is refused, never scored under
  another.
- **The rules are also written as cases in JSON,** a game in and the answer out, under
  `packages/scoring/cases`. A case holds a refusal's code, its data and its place and never its
  sentence, since the wording is one implementation's own. The cases are the contract a second
  implementation has to pass. Every case goes in as text and comes back as text, so the order of
  what is refused and what is passed over in a game are part of the contract too.
- **The package builds to one script with no dependencies,** `dist/scoring.global.js`, beside the
  modules a bundler imports. Evaluated once, it leaves the package's exports on one global.

A phone app may embed that script or carry rules of its own held to the cases, game by game.
Nothing here changes for either.

## Consequences

- A phone app that embeds the script carries a script runtime. iOS has one. Android bundles one,
  which adds to the app's size.
- A caller with no type checker passes rounds the compiler never saw, so each game checks the
  shape of what it is given, which is code a typed caller would not need.
- Working in whole numbers rules out a game scored in halves until its rules are written in the
  smaller unit.
- A refusal's sentence is English and the package's own, and is not part of the contract. An app
  that words refusals itself, or in another language, goes by the code and by the data each
  problem carries, which names the card refused or the number of players a game takes. Reading
  those out of the sentence would tie every caller to its wording.
- A change to how a game scores is a new version of its rule set, with the old one kept for the
  games saved under it. A correction to a rule that was simply wrong may replace the version in
  place, and is the exception that is written down when it happens.
- An addition that scores every game saved before it exactly as before stays in the version it is
  added to, and anything else is a new one. Players out of a round came in this way: a game saved
  before it has nobody out, so it scores as it did, and the cases written before it pass with
  nothing changed but each round's `out` and the game's `missed`.

## How it is tested

- `packages/scoring/src/cases.test.ts` runs every case in `packages/scoring/cases` against the
  source.
- `packages/scoring/scripts/cases-outside-node.mjs` runs the same cases against the built script
  inside QuickJS, which has none of Node's globals and none of a browser's. CI runs it after the
  build. It proves the one script holds the whole package and needs nothing a bare engine lacks.
  It proves QuickJS, and stands in for the engine a phone ships.
- `packages/scoring/src/index.test.ts` scores a game whose input is frozen, so a function that
  changed what it was given would throw, and checks that an answer survives being written as JSON.
- The lint rules refuse any import from Node in the package's source, and its build is checked
  with no environment's types, so it cannot name `process` or `document`.
