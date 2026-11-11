# @gametabletally/scoring

The scoring rules of card and table games. A game goes in as plain data, and the scores come out:
each round, the totals, who is ahead, whether the game is over and who won. It has no dependencies
and runs anywhere JavaScript does.

It knows Flip 7.

## Scoring a game

```ts
import { score } from '@gametabletally/scoring';

const result = score({
    game: 'flip-7',
    rules: 1,
    options: {},
    players: ['ann', 'ben', 'cat'],
    rounds: [
        {
            entries: {
                ann: { numbers: [3, 5, 9], modifiers: ['x2', '+4'], bust: false },
                ben: { numbers: [12], modifiers: [], bust: false },
                cat: { numbers: [7, 7], modifiers: [], bust: true },
            },
        },
    ],
});

result.totals; // { ann: 38, ben: 12, cat: 0 }
result.leaders; // ['ann']
result.state; // 'in-play'
```

`score` is given everything entered so far, every time. It keeps nothing between calls, so changing
or taking back an earlier round is scoring the game again with the round changed. The players' ids
are the caller's own and never appear in a message.

`GAMES` lists each game the package knows, with its id, its name, the version of its rule set a new
game starts under, and how many can play.

## What comes back

- `rounds` holds one result for each round entered. A round is `scored` once every player's entry
  is in and accepted, `open` while entries are missing, `refused` when something in the round
  itself was turned down, and `skipped` when it was never read for a reason outside it: an earlier
  round has yet to be scored, the game was already over, or the game as a whole was refused. Its
  `scores` are what stands so far, and count toward a total only once the round is scored.
- `totals` is each player's total over the scored rounds.
- `leaders` is whoever is ahead, and `winners` is whoever won once `state` is `over`.
- `problems` is everything the rules refused. Each has a `code` that never changes, a `message`
  that says the reason in a sentence, and the `round`, counted from zero, and the `player` it is
  about, each null when the problem is wider than that. They come in a set order: the rounds in
  order, and within a round the entries for nobody in the game, sorted by id, then the players'
  in seat order. An entry is refused once, for the first thing wrong with it.

Nothing refused is ever scored, and `score` does not throw, whatever it is given. The game and
each round are checked as they are read, so a caller with no type checker is told what is wrong.
A round counts toward the totals only when every round before it does: one entered behind a round
that is unfinished or refused is passed over, so no game is over on totals with a round missing.

Whatever a game, a round or an entry holds beyond what the rules read is passed over, so a saved
game can carry its own id or the time a round was entered.

`scoreJson` takes the same game as JSON text and answers in JSON text, for a caller in another
language. Text that is not JSON, or not a game, is answered with a problem like any other.

## Flip 7

A round's entry for each player is the number cards held, from 0 to 12, the modifier cards held,
which are `+2`, `+4`, `+6`, `+8`, `+10` and `x2`, and whether the player bust.

The deck's action cards, Freeze, Flip Three and Second Chance, change play and never a score.
Freeze ends a player's round with what they hold, Flip Three makes a player take three more cards,
and Second Chance cancels one repeated number. Each is settled at the table, so an entry leaves
them out and holds only the cards that score. An entry that names one is refused.

A round's score is the number cards added up, doubled by the x2 card, plus each plus card, plus
fifteen for seven different numbers. Neither the plus cards nor the fifteen are doubled. A bust
scores nothing. The game is for three or more players.
It is over at the end of the round in which a player reaches two hundred, and the highest total
wins. A tie at the top does not end it, and the game goes on by whole rounds until one player
leads.

## The cases

`cases` holds the rules as JSON, one file for each game, which names the `game`, the version of
its `rules` and a list of `cases`. Each case has a `name`, the answer to `expect`, and the game
either as an `input`, as `score` takes it, or as `text`, where what is handed over is not a game
at all. Either way a case is run by handing the game to `scoreJson` as text and reading the answer
back. An expected problem holds its `code`, its `round` and its `player` and never its sentence,
which is this implementation's own wording.

The cases are the contract. Anything else that scores these games, in any language, agrees with
this package when it passes them. The package's tests run them against the source, and
after a build, `npm run cases:outside-node` runs them against the built script in QuickJS, a
runtime that is not Node.

## One script

Beside the modules, the build writes `dist/scoring.global.js`, the whole package as one script
with nothing to load beside it. Evaluated once, it leaves the exports on a global named
`GameTableTallyScoring`, which is the form a script runtime with no module loader takes.

The trademarks of the games named here belong to their owners. This package is not affiliated with
or endorsed by any of them, and holds none of their artwork.
