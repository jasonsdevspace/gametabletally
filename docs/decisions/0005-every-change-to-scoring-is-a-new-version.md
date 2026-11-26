# 5. Every change to how a game scores is a new version of its rule set

**Status:** accepted

## Context

A game names the version of the rule set it is played under, and the package scores it by that
version, as [record 1](0001-scoring-runs-on-the-phone.md) sets out. Record 1 let one change keep its
version: a correction to a rule that was simply wrong could replace the version in place. With one
phone and no server that is harmless, since the phone holds the only copy of the rules. Once a
server checks a game a phone has scored, a phone on an older build and a server on a newer one would
hold different rules under one version number, and the server would refuse a score the phone worked
out by the rules it had. The same holds for two phones at one table on different builds.

## Options

**A correction keeps its version, and each answer names the build that worked it out.** A game
saved before the correction is scored by the corrected rule the next time it is scored, with nothing
for anyone to do. A server checking a score has to know which build's rules a phone used, so it
keeps the rules of every build and scores by the one the phone names, which is a version by build
under another name. Two phones on different builds show different totals for the same game, and
neither is wrong by its own build.

**Every change to how a game scores is a new version, a correction included.** A version number
always means the same rules, everywhere and on every build. A game saved under the earlier version
keeps the answer it had, the wrong rule included, until it is moved to the later version.

## Decision

**Every change to how a game scores is a new version of its rule set, a correction included, with
the earlier one kept.** A version is scored only by the rules released under it, so two builds that
hold a version and both score a game give it the same answer. An older build may refuse as a whole a
game naming an option or a value added after it, as record 3 sets out, and a build that does not
hold the version refuses the game with `unknown-rules`. Neither scores a game by other rules.

- **Record 1's rule for additions stands, and an answer that refused the game as a whole for naming
  an option or a value the rule set did not have may change within a version,** since a game
  refused that way was given no score, so a later answer changes no score anyone was given. Record
  3's rules on what about an option is fixed within a version still hold. Any other answer, a
  refusal for the game's players among them, changes only in a new version.
- **Every case's released answer is pinned.** `packages/scoring/released` holds each case's name
  and a digest of what it hands over and of the answer it expects, and a test fails where a pinned
  answer changes or a pinned case is taken away. Only what a case covers is held this way, so a
  change to how a game scores comes with a case that shows it, and one no case covers is caught in
  review.
- **`npm run pin-cases -w @gametabletally/scoring` pins every case not yet pinned,** and writes
  nothing while a released answer has changed, a released case is gone or a released rule set's
  cases are gone, naming each.
- **Moving a saved game to a later version is the app's to do, not the package's,** since it
  changes a game's totals after the fact. The package scores a game by the version it names.

## Consequences

- A rule found wrong after a game is saved under it stays wrong for that game unless the game is
  moved to a later version.
- The versions of a game's rules grow with each correction, and each keeps its file of cases and of
  released answers, so the package carries every rule set a saved game could name.
- A case is pinned in the change that adds it, since the test fails on a case not yet pinned, so a
  case written wrong can be put right only before that change merges, and after it in a new
  version.

## How it is tested

- `packages/scoring/src/released.test.ts` holds each file of cases to the answers in `released`,
  and fails where an answer changed, where a case was taken away, where a case is not yet pinned or
  where a rule set the package holds has no released answers. It also tests the pinning itself: a
  changed answer and a case taken away fail, an answer that refused a game for an option it did
  not have may change, and one that refused a game for its players may not.
