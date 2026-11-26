# 3. Rule options belong to the scoring package, and the published rule is the default

**Status:** accepted

## Context

Tables play with house rules: a game of Flip 7 to a lower total, Skyjo to a higher one, Wizard
with a rule on what the bids may add up to. A game names the version of its rule set it is played
under, and [record 1](0001-scoring-runs-on-the-phone.md) holds a change to how a game scores to a
new version, with additions that score every saved game as before kept in the version they are
added to. An option changes how a game scores, so it needs a rule of its own for where it is
written down and what changing one costs.

A saved game names its options by id and value. A phone on an older build, a newer build and a
later server have to read those the same way, or one game scores two ways.

## Options

**Each app declares the options it offers, and the package only scores by them.** An app draws
its own fields with its own wording. The app and the package can then disagree on what an option
is called, what it allows and what it defaults to, and a phone app in another language has to copy
them by hand.

**The package declares the options, and every change to one is a new version of the rule set.**
Nothing about an option can ever differ under one version number. Adding a value to a target
score, or a new option that is off unless chosen, then means a new version, with the old one kept
for the games saved under it, which scores them exactly as the new one does. The versions multiply
with no change to any score.

**The package declares the options, an option's meaning is fixed within a version, and an
addition stays in it.** Additions go in as record 1 lets any addition go in. What a saved game's
options already mean cannot change.

## Decision

**Options belong to the scoring package, and the published rule is each one's default.** Each game
in `GAMES` lists its options, with an id, a kind, a default and, for a number, the values it
allows, so an app draws them from the package and the screen and the rules cannot disagree. A game
given no options, or an option given as null, is played by the book.

- **Within a version of a rule set, an option's id, its kind, its default, what each of its
  values means and the switches it excludes are fixed.** Changing any of them is a new version, as
  any change to how a game scores is.
- **Adding an option, or a value to one, stays in the version,** under record 1's rule for
  additions: a game saved before it never gave the new option or value, so it scores as it did.
- **An option holds for the whole game.** It is handed over with the rest of the game every time,
  and the package has no notion of one changing between rounds.
- **Under Wizard's Plus or minus one, every bid made counts toward the round's total,** the bid of
  a player then marked out of the round included. The bids after it were made knowing it, so
  marking a player out never changes whether the bids are refused. A table that bids again after a
  player leaves clears the stale bid, and the bids are added up without it.
- **Wizard's Canadian rule is an option of its own beside Plus or minus one,** since some tables
  play it instead of that wider rule, and like it the Canadian rule is off by the published
  rules. The dealer may not make the bids add up to the cards dealt while they have the highest
  score alone, and may always bid nothing. The highest score is the highest total over every
  seat, as the published rule reads the score sheet, rather than the result's `leaders`, which
  leave out a player who missed a round.
- **Who deals is part of Wizard's first rule set,** since the Canadian rule depends on it. The
  first seat deals the first round and the deal moves one seat on each round, passing over a
  player out of it, as the app has always shown. A table that wants a different first dealer
  seats that player first.
- **Two switches that rule on the same thing name each other in `excludes`,** and a game given both
  on is refused with `options-clash`, rather than played by whichever the package checks first.
  What a switch excludes is fixed within a version, like its id, its kind and its default, since a
  new exclusion between two options a game could already have had on would refuse that game. An
  exclusion is an addition only where it names an option added in the same change, as Plus or
  minus one's exclusion of the Canadian rule is.
- **The name and description of an option are the package's English** and not part of the
  contract, as a refusal's sentence is not. A caller keys on the id.

## Consequences

- An older build refuses a value or an option added after it with `value-not-allowed` or
  `unknown-option`, rather than scoring it. A game saved with a value from a newer build cannot be
  scored on a phone that has not updated, and says why instead of scoring it by the wrong rule.
- An app built against an older version meets an option of a kind it does not know. It hides it,
  and the game plays by the default, which is the published rule.
- A table that wants a target the list does not hold has to wait for a value to be added. A list
  keeps every value an app offers one the rules know.
- Each option is code in its game's rules and a field in the app, so the options are kept few.

## How it is tested

- `packages/scoring/options` holds, for each version of each game's rule set, the id, kind,
  default and values of each option it was released with. `packages/scoring/src/options.test.ts`
  fails when an id, a kind or a default changes or a value is taken away, and passes when an
  option or a value is added.
- The cases in `packages/scoring/cases` cover each option and each refusal, against the source and
  the built script, and the cases written before options pass unchanged, which holds a game given
  none to the published rules.
