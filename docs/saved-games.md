# The saved format

What the app saves on the phone, and the shape it is backed up and handed on in. The records in
the phone's database and the records in an exported file are the same, so a backup, a later sync
and an app in another language all read one thing. This page describes version 1.

The types are in `apps/web/src/store/format.ts`, which also reads a file and refuses what it
cannot read.

## What is saved

Players and games, and nothing worked out from them. A game holds what was entered and the version
of the rule set it was played under, and `@gametabletally/scoring` works the scores out from that
whenever they are shown. No total is saved anywhere.

### A player

| Field     | Holds                                                                                                                                                                                  |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | The player's id, which games name them by. It never changes                                                                                                                            |
| `name`    | What they are called, which can change                                                                                                                                                 |
| `added`   | When they were added, as an ISO 8601 date and time                                                                                                                                     |
| `removed` | Whether they were removed. A removed player is offered for no new game, and is kept so the games they played still say who played. A player removed before playing any game is deleted |

### A game

| Field     | Holds                                                                                     |
| --------- | ----------------------------------------------------------------------------------------- |
| `id`      | The game's id                                                                             |
| `game`    | The game played, by the scoring package's id for it, such as `flip-7`                     |
| `rules`   | The version of the game's rule set it is played under                                     |
| `options` | The options it was started with, as an object                                             |
| `players` | The players' ids, in seat order                                                           |
| `rounds`  | Every round saved, in order, in the shape the game's rules read                           |
| `draft`   | The round being entered or reopened, or null when there is none, as once the game is over |
| `started` | When it was started, as an ISO 8601 date and time                                         |
| `changed` | When it was last changed, as an ISO 8601 date and time                                    |

`game`, `rules`, `options`, `players` and `rounds` are what the scoring package's `score` takes, as
they are. A game in play and a finished game are saved alike: whether a game is over is worked out
from its rounds.

### The round being entered

A round is entered a step at a time, and each step is saved as it is made, so a page closed in the
middle of a round opens again at the same step. Until the round is saved it is the game's `draft`,
kept beside `rounds` and never among them, since the scoring package would read a hand half
entered as a whole one. Saving the round moves it into `rounds`, whole.

| Field   | Holds                                                                                                                                   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `index` | The round's place in the game, counted from zero: the number of saved rounds for the next round, or the place of a reopened saved round |
| `round` | The round as entered so far, in the shape the game's rules read                                                                         |
| `step`  | The step it is at, as `part` and `player`, or null when no step is left to enter. A reopened round starts at its first step             |

A step's `part` is `entry`, a player's entry, `ender`, who ended a Skyjo round, `bid` or `tricks`,
a Wizard player's bid or count of tricks. Its `player` is the player's id, or null for `ender`.
Flip 7 takes each seat's entry in turn. Skyjo takes each seat's entry and then who ended the round.
Wizard takes every bid and then every count of tricks. A player the round names as `out` has no
step. A reopened round leaves the saved one as it was until the draft is saved, so letting the
draft go changes no saved round. A saved round is reopened only while the round being entered
holds nothing of its own, since a game has one draft. The steps of each game's round are in
`apps/web/src/play/steps.ts`.

### What each field has to be

Every field is required. A record that breaks one of these is not a player or a game.

- `id`, `name`, `game` and each id in `players` are text that is not empty. An id is any such
  text, with no form of its own.
- `removed` is true or false.
- `rules` is a whole number from 1.
- `options` is an object, never a list.
- `players` and `rounds` are lists, and either may be empty. What a round holds is the game's own
  and is not checked here: the scoring package checks it when the game is scored.
- `draft` is null or an object. Its `index` is a whole number from 0 to the number of saved
  rounds, its `round` is an object, and its `step` is null or an object whose `part` is one of the
  four above and whose `player` is text that is not empty, or null.
- A game may name a player the file or the phone does not hold. It is shown with no name.
- A field this page does not name is dropped when a record is read.

### Dates and times

`added`, `started`, `changed` and `exported` are ISO 8601 dates and times in UTC, ending in `Z`,
written to the second or finer: `2026-11-01T10:20:00Z` and `2026-11-01T10:20:00.500Z` are both
read. A time with an offset, or a date with no time, is not. Two times are compared as moments,
never as text, so one written to the second and one written to the millisecond fall in the right
order.

## An exported file

One JSON object holding everything saved. The about page saves it as
`game-table-tally-2026-11-04.json`, named for the day on the phone's own calendar, and restores
from one by merging it as below.

```json
{
    "format": "gametabletally",
    "version": 1,
    "exported": "2026-11-04T09:00:00Z",
    "players": [
        { "id": "p-ann", "name": "Ann", "added": "2026-11-01T10:00:00Z", "removed": false },
        { "id": "p-ben", "name": "Ben", "added": "2026-11-01T10:01:00Z", "removed": false },
        { "id": "p-cat", "name": "Cat", "added": "2026-11-01T10:02:00Z", "removed": false }
    ],
    "games": [
        {
            "id": "g-1",
            "game": "flip-7",
            "rules": 1,
            "options": {},
            "players": ["p-ann", "p-ben", "p-cat"],
            "rounds": [],
            "draft": {
                "index": 0,
                "round": { "entries": {}, "out": [] },
                "step": { "part": "entry", "player": "p-ann" }
            },
            "started": "2026-11-01T10:05:00Z",
            "changed": "2026-11-01T10:20:00Z"
        }
    ]
}
```

`format` tells the file apart from any other kind. `version` is the version of this page's shape.

## Reading a file

- A file is refused as not a file of saved games when it is not a JSON object, names another
  `format`, has a `version` that is not a whole number from 1, has no `exported`, has `players` or
  `games` that is not a list, holds a player or a game that is not one, or holds two players or
  two games with one id.
- A file whose `version` is newer than the app knows is refused whole, with a sentence that says
  to update the app. Reading the parts an older app understands would drop what the newer one
  saved, with nothing said. The version is checked before the records are.
- Nothing saved changes when a file is refused.

## Merging a file

A file is merged into what is already saved, whole or not at all:

- A player or a game that is not on the phone is added.
- A game that is on the phone is kept as whichever copy has the later `changed`, so no game is
  there twice. When the two were changed at the same moment, the phone's copy is kept.
- A player who is on the phone is kept as they are there: their name, when they were added and
  whether they were removed.
- Nothing is deleted by a merge, so a game deleted on the phone returns when a file that holds it
  is merged.

## On the phone

The records are kept in IndexedDB, in a database named `gametabletally` with a store named
`players` and a store named `games`, each keyed by `id`. The database's version is the saved
shape's version, so a later shape is brought in by the upgrade that opening the database at the
new version runs. Decision record 2 says why.

- Each thing the app does is one transaction that reads and writes together, so a change is
  saved whole or not at all and is never decided on what another change has since replaced.
- A player or a game that breaks the rules above is refused when it is saved.
- A record already there that is not a player or a game is passed over when the records are
  read, is left out of an exported file, and is counted, so a page can say a backup is not whole.
  A player such a record names is still kept when they are removed.
- A database a newer version of the app has upgraded is not opened by an older one, which says to
  update the app. An open tab lets go of the database when a newer version asks to upgrade it.

## Changing the shape

A change to what a record holds is a new version. It comes with an upgrade for the database, a
reader for files of the version before, a test from a saved file of that version, and this page
changed to describe it.
