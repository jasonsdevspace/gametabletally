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
keeps the answer it had, the wrong rule included, until it is moved to the later version on purpose.

## Decision

**Every change to how a game scores is a new version of its rule set, a correction included, with
the earlier one kept.** A version is read only by the rules released under it, so two builds that
hold a version give a game the same answer, and a build that does not hold it refuses the game with
`unknown-rules`.

- **Record 1's rule for additions stands.** An addition that scores every game saved before it
  exactly as before stays in the version it is added to, and so does an answer that only refused
  the game as a whole, such as one naming an option the rule set did not have, since no game
  refused that way was ever played or saved.
- **Every released answer is pinned.** `packages/scoring/released` holds a digest of what each case
  hands over and of the answer it expects, and a test fails where a released answer changes or a
  released case is taken away.
- **Moving a saved game to a corrected version is the app's to offer,** with the table's agreement,
  since it changes a game's totals after the fact. Until then the game is scored as it always was.

## Consequences

- A rule found wrong after a game is saved under it stays wrong for that game, and an app that
  knows of a later version can offer to move the game to it.
- The versions of a game's rules grow with each correction, and each keeps its file of cases and of
  released answers, so the package carries every rule set a saved game could name.
- A case written wrong and released can only be put right in a new version. Cases are checked before
  they are released, and the pin is written once they are.

## How it is tested

- `packages/scoring/src/released.test.ts` holds each file of cases to the answers in `released`, and
  fails where one changed, where one was taken away or where a case is not yet pinned. It also holds
  the rules themselves: a changed answer and a taken away case fail, and an answer that refused the
  game as a whole may change.
- `npm run pin-cases -w @gametabletally/scoring` pins new cases and writes nothing where a released
  answer changed, naming each.
