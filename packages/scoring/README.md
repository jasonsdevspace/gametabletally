# @gametabletally/scoring

The scoring rules of card and table games. A game goes in as plain data, and the scores come out:
each round, the totals, who is ahead, whether the game is over and who won. It has no dependencies
and runs anywhere JavaScript does.

It knows Flip 7, Skyjo and Wizard.

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

## Players out of a round

Any round, in any game, may name `out`: the ids of the players who are out of it, because they
left the table or stepped away for a hand. A player out of a round has no entry in it and scores
nothing for it, which is not a score of zero, so their total stays what it was. The round is
whole once every other player's entry is in, with whatever else the game needs, and a player can
be out of one round and back for the next. Who is out is decided round by round, and nothing
carries over by itself. A list given as null, or not given, names nobody.

A round needs two players in it, whatever the game takes to start, so a table of three that loses
one carries on as two. A round with fewer than two players in it is refused, and so is a list
that is not a list of ids, one that names somebody not in the game, or one that names a player
twice. Such a round is read no further. An entry for a player the round names as out is refused
too.

A player who has been out of a scored round cannot win while another player has missed none,
since they did not play the game the others played. Their total is still kept and shown, and it
can end the game when it reaches the end by the game's rules. Who is ahead, and who wins, is
worked out among the players who have missed no scored round, and among everyone when every
player has missed one. The package holds each game's winners to those players, so no game can
name another.

`GAMES` lists each game the package knows, with its id, its name, the version of its rule set a new
game starts under, whether the highest or the lowest total is ahead, how many can play, and its
options.

## Options

A table that plays by a house rule says so in `options`, which holds a value for each option it
changes, by the option's id. Each game in `GAMES` lists its options, each with its `id`, its `name`,
a plain `description`, its `default` and the `values` it allows, so an app offers them from here and
the screen and the rules cannot disagree. The default is the published rule, so a game given no
options, or an option given as null, is played by the book and scores as it always has, under the
same version of its rule set.

The options hold for the whole game. `score` is handed them with everything else each time, and
scores every round by them, so a game whose options are changed is scored again from the start by
the new ones. A caller saves them with the game.

An option the game does not have is refused, and so is a value the option does not allow, and a
game refused for either is read no further. These come after anything wrong with the players,
sorted by the option's id. Each game's options are under its own heading below.

## What comes back

- `rounds` holds one result for each round entered. A round is `scored` once the entry of every
  player in it is in and accepted, `open` while entries are missing, `refused` when something in the
  round itself was turned down, and `skipped` when it was never read for a reason outside it: an
  earlier round has yet to be scored, the game was already over, or the game as a whole was refused.
  Its `scores` are what stands so far, and count toward a total only once the round is scored. Its
  `out` names the players out of it, in seat order, and is empty for a round never read. A round
  refused over its list of players out, or for having too few in it, has empty `scores`, since its
  entries were never read, and its `out` holds only those listed who are in the game, or nobody when
  the list is not a list of ids.
- `totals` is each player's total over the scored rounds.
- `leaders` is whoever is ahead, and `winners` is whoever won once `state` is `over`, each among
  the players who have missed no scored round, or among everyone when every player has.
- `missed` names everyone who has been out of a scored round, in seat order, so a table of scores
  can mark them. It is empty when nobody has.
- `problems` is everything the rules refused. Each has a `code` that never changes, a `message`
  that says the reason in a sentence, `data` that holds what it is about, and the `round`, counted
  from zero, and the `player` it is about, each null when the problem is wider than that. They
  come in a set order: the rounds in order, and within a round, first what is wrong with its list
  of players out, which is a list that is not of ids, or else the ids of nobody in the game,
  sorted by id, and then the players named twice, in seat order, and after those a round with too
  few players left in it. A round with any of these is read no further. Then come the entries for
  players out of it, in seat order, the entries for nobody in the game, sorted by id, and the
  entries of the players in it, in seat order. In Skyjo what is wrong with the ender comes last.
  In Wizard a round whose bids come to the cards dealt, under Plus or minus one, comes last, and
  is checked only when nothing else in the round is refused. A round whose tricks do not come to
  the cards dealt comes last too, and is checked only when nothing else in it is refused, its bids
  included.
  An entry is refused once, for the first thing wrong with it.

Nothing refused is ever scored, and `score` does not throw, whatever it is given. The game and
each round are checked as they are read, so a caller with no type checker is told what is wrong.
A round counts toward the totals only when every round before it does: one entered behind a round
that is unfinished or refused is passed over, so no game is over on totals with a round missing.

Whatever a game, a round or an entry holds beyond what the rules read is passed over, so a saved
game can carry its own id or the time a round was entered.

`scoreJson` takes the same game as JSON text and answers in JSON text, for a caller in another
language. Text that is not JSON, or not a game, is answered with a problem like any other.

## What a problem is about

A caller that words a refusal itself, in its own voice or another language, goes by the `code` and
the `data`. The `message` is this package's own wording and may change. `data` is always an
object, and is empty where the code has nothing to add. A field's meaning belongs to its code, so
read it by code: `max` is a number of players under one code, a number of cards under another
and a total under a third.

In TypeScript a `Problem` is typed by its code, so narrowing on `code` gives its `data` with that
code's fields, and reading a field the code does not carry fails the type check. `ProblemData` holds
each code's data, and `ProblemOf` is a problem of one code, for a function that handles only that
one. Where the table says `data` may be empty, the type says so too: the `part` of `not-a-game` and
`not-an-entry` is read only after checking `'part' in problem.data`, and the `kind` of `unknown-
card` may be undefined. A code this package adds later is not one known to the types of a caller
built against an older version, so a caller keeps the `message` from before it narrows and words
with it any code it does not handle.

| Code                | When                                                                                                | `data`                                                                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `not-json`          | The text handed to `scoreJson` is not JSON                                                          | empty                                                                                                                                                                                                         |
| `not-a-game`        | What is handed over is not a game                                                                   | `part`, the part it lacks or has wrong: `game`, `rules`, `options`, `players` or `rounds`. Empty when it is not an object at all                                                                              |
| `unknown-game`      | No game has the id                                                                                  | `game`, the id given                                                                                                                                                                                          |
| `unknown-rules`     | The game has no rule set with the version                                                           | `rules`, the version given                                                                                                                                                                                    |
| `too-few-players`   | The game takes more players                                                                         | `min`, the fewest it takes, and `given`, how many were listed                                                                                                                                                 |
| `too-many-players`  | The game takes fewer players                                                                        | `max`, the most it takes, and `given`, how many were listed                                                                                                                                                   |
| `player-twice`      | A player is listed more than once. Raised once for each such player, named by `player`              | empty                                                                                                                                                                                                         |
| `unknown-option`    | The game has no such option                                                                         | `option`, its name                                                                                                                                                                                            |
| `value-not-allowed` | An option is given a value it does not allow                                                        | `option`, its id, and `value`, the value given when it is text, a number or true or false, and null for anything else                                                                                         |
| `not-a-round`       | A round does not hold its entries, or lists its players out by something other than their ids       | `part`, `out` when it is the list of players out. Empty when the round does not hold its entries                                                                                                              |
| `unknown-out`       | A round names as out somebody not in the game, named by `player`                                    | empty                                                                                                                                                                                                         |
| `out-twice`         | A round names a player as out more than once. Raised once for each such player, named by `player`   | empty                                                                                                                                                                                                         |
| `too-few-in-round`  | Fewer than two players are in a round                                                               | `min`, the fewest a round takes, and `given`, how many were in it                                                                                                                                             |
| `round-unfinished`  | A later round was entered before this one was played out                                            | empty                                                                                                                                                                                                         |
| `no-ender`          | Skyjo: every player has counted and the round does not say who ended it                             | empty                                                                                                                                                                                                         |
| `unknown-ender`     | Skyjo: the round was ended by nobody in the game                                                    | `ender`, what was given when it is text, a number or true or false, and null for anything else                                                                                                                |
| `ender-out`         | Skyjo: the round was ended by a player out of it, named by `player`                                 | empty                                                                                                                                                                                                         |
| `after-a-gap`       | An earlier round has yet to be scored                                                               | empty                                                                                                                                                                                                         |
| `after-the-end`     | The game was over before this round                                                                 | empty                                                                                                                                                                                                         |
| `unknown-player`    | An entry is for nobody in the game, named by `player`                                               | empty                                                                                                                                                                                                         |
| `out-with-entry`    | A round has an entry for a player it names as out, named by `player`                                | empty                                                                                                                                                                                                         |
| `not-an-entry`      | An entry does not have the game's shape                                                             | `part`, the part at fault. Flip 7: `bust`, `numbers` or `modifiers`. Skyjo: `total`, `cards`, or `both` when it gives the two and takes one. Wizard: `bid` or `tricks`. Empty when it is not an object at all |
| `unknown-card`      | The deck holds no such card. Flip 7: or the card is in the wrong list                               | `card`, the card as given when it is text, a number or true or false, and null for anything else. Flip 7 adds `kind`, the list it was in: `number` or `modifier`                                              |
| `number-twice`      | Flip 7: a hand that did not bust holds a number twice                                               | `number`, the number                                                                                                                                                                                          |
| `modifier-twice`    | Flip 7: a hand that did not bust holds a modifier twice                                             | `modifier`, the modifier                                                                                                                                                                                      |
| `too-many-cards`    | Skyjo: a hand lists more cards than a grid holds                                                    | `max`, the most a grid holds, and `given`, how many were listed                                                                                                                                               |
| `too-many-copies`   | Skyjo: a hand lists more of a card than the deck holds                                              | `card`, the card, `max`, how many the deck holds, and `given`, how many were listed                                                                                                                           |
| `impossible-total`  | Skyjo: a total is one no hand can come to                                                           | `min` and `max`, the least and the most a hand comes to, and `given`, the total                                                                                                                               |
| `too-many-numbers`  | Flip 7: a hand that did not bust holds more numbers than end a round                                | `max`, the most a hand holds, and `given`, how many it held                                                                                                                                                   |
| `impossible-bid`    | Wizard: a bid is below zero or above the cards dealt                                                | `min` and `max`, the fewest and the most tricks a player can bid, and `given`, the bid                                                                                                                        |
| `impossible-tricks` | Wizard: a player's tricks are below zero or above the cards dealt                                   | `min` and `max`, the fewest and the most tricks a player can take, and `given`, the tricks                                                                                                                    |
| `trick-total`       | Wizard: the tricks of the players in a round do not come to the cards dealt to each                 | `dealt`, the cards dealt to each player, and `given`, what the tricks came to                                                                                                                                 |
| `bid-total`         | Wizard, under Plus or minus one: the bids of the players in a round come to the cards dealt to each | `dealt`, the cards dealt to each player, which is what the bids came to                                                                                                                                       |

Whatever is entered, `data` holds only text, numbers, true or false and null, so an answer always
survives being written as JSON.

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
It is over at the end of the round in which any player's total reaches two hundred, a player who
has missed a round included, and the highest total among the players who have missed no round
wins, or among everyone when every player has missed one. A tie at the top of those does not end
it, whatever a player who missed a round holds, and the game goes on by whole rounds until one
player leads.

Its one option is `target-score`, the total that ends the game: 100, 150, 200, 250 or 300, and 200
by the published rules. The game is over at the end of the round in which a total reaches it, and
goes on by whole rounds past a tie at the top, as it does at 200.

## Skyjo

A round holds each player's entry and, once it is known, `ender`, the id of the player who ended
the round. An entry is `total`, the whole number a player counted, or `cards`, the values of the
cards they hold, each from -2 to 12, which are added up. It takes one and not both. A part given
as null is a part not given, for an entry and for the ender alike.

A grid holds twelve cards at most and loses a column whenever its three cards match, so a hand
may hold fewer, or none. The deck holds five cards of -2, ten of -1, fifteen zeros and ten of
each card from 1 to 12. A list of cards is held to those, and a total to what twelve cards can
come to, which is from -17 to 142.

A round's score is what each player holds. The player who ended the round has to hold the least of
it alone: when another player holds as little or less, and their own score is above zero, it is
doubled. The ender is compared only with the players in the round, and a round ended by a player out
of it is refused. The game is for two to eight players. It is over at the end of the round in which
a player reaches one hundred, whoever's total it is, and the lowest total of the players who have
missed no round wins, or of everyone when every player has missed one. Players level on it share the
win.

Its one option is `target-score`, the total that ends the game: 50, 100, 150 or 200, and 100 by the
published rules. The game is over at the end of the round in which a total reaches it.

A round is `open` while a player has yet to count, whether or not it names its ender, so long as
any ender it names is a player in it, and its
`scores` then show what each holds with nothing doubled. Once every player has counted, a round
that does not name its ender is `refused`, since the doubling cannot be worked out, and what each
holds still stands in its `scores`. Nothing is doubled in a round that is refused for any reason.

## Wizard

A round's entry for each player is `bid`, the tricks they bid to take, and once the hand is played,
`tricks`, the tricks they took. Each is a whole number from zero to the cards dealt, which is the round's place in `rounds` counted from one: one card in the first round, two in the second, and so on. Tricks given as null are tricks not given. The bid is checked before the tricks, so an entry with tricks and no bid is refused for its bid. Which card takes a trick is settled at the table, so an entry holds only the
counts.

A bid met exactly scores twenty and ten for each trick taken, and a bid missed loses ten for each
trick over or under. The game is for three to six players and lasts sixty rounds divided by how many
play: twenty for three, fifteen for four, twelve for five and ten for six, which `wizardRounds` gives
for a number of players. It is over after the last
round, and the highest total of the players who have missed no round wins, or of everyone when every
player has missed one. Players level on it share the win.

A round is `open` while a player has yet to bid, and once every bid is in, while a player's tricks
are not, so the bids can be saved before the hand is played. Its `scores` then show the players whose
tricks are in. Once every player in the round has given their tricks, the tricks have to come to the cards dealt to each, and a round where they do not is `refused`. A round whose tricks already come to more than the cards dealt is refused before then, since no tricks still to come can put it right. What each bid came to still stands in its `scores`, and counts toward no total.

A player out of a round changes neither the cards it deals nor the number of rounds, which are both
fixed when the game starts, and the tricks of the players in it come to the cards dealt. A bid made by a player who is then out of the round is passed over, since a bid with no tricks behind it is nobody's score. That is an entry that would be taken as a bid with no tricks yet. Any other entry for a player out of a round is refused, as it is in every game.

Its one option is `plus-minus-one`, the published variant Plus or minus one, which is `true` or
`false` and off by the published rules. With it on, the bids of a round may not add up to the cards
dealt to each player, so at least one player misses. Once every player in the round has bid, a round
whose bids come to the cards dealt is refused, with the count, whether or not its tricks are in, and
what each bid came to still stands in its `scores`. Only the bids of the players in the round are
added up, so the bid of a player out of it, which is passed over, counts for nothing.

## The cases

`cases` holds the rules as JSON, a folder for each game and a file in it for each version of its
rule set, named by the version, such as `cases/wizard/1.json`. A game saved under an earlier version
is still scored by it, so its cases stay. Each file names the `game`, the version of its `rules` and a
list of `cases`. Each case has a `name`, the answer to `expect`, and the game either
as an `input`, as `score` takes it, or as `text`, where what is handed over is not a game at all.
Either way a case is run by handing the game to `scoreJson` as text and reading the answer back. An
expected problem holds its `code`, its `data`, its `round` and its `player` and never its sentence,
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
