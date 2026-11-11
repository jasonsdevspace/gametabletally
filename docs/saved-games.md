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

| Field     | Holds                                                                 |
| --------- | --------------------------------------------------------------------- |
| `id`      | The game's id                                                         |
| `game`    | The game played, by the scoring package's id for it, such as `flip-7` |
| `rules`   | The version of the game's rule set it is played under                 |
| `options` | The options it was started with, as an object                         |
| `players` | The players' ids, in seat order                                       |
| `rounds`  | Every round entered, in order, in the shape the game's rules read     |
| `started` | When it was started, as an ISO 8601 date and time                     |
| `changed` | When it was last changed, as an ISO 8601 date and time                |

`game`, `rules`, `options`, `players` and `rounds` are what the scoring package's `score` takes, as
they are. A game in play and a finished game are saved alike: whether a game is over is worked out
from its rounds.

## An exported file

One JSON object holding everything saved:

```json
{
    "format": "gametabletally",
    "version": 1,
    "exported": "2026-11-04T09:00:00Z",
    "players": [
        { "id": "p-ann", "name": "Ann", "added": "2026-11-01T10:00:00Z", "removed": false }
    ],
    "games": [
        {
            "id": "g-1",
            "game": "flip-7",
            "rules": 1,
            "options": {},
            "players": ["p-ann", "p-ben", "p-cat"],
            "rounds": [],
            "started": "2026-11-01T10:05:00Z",
            "changed": "2026-11-01T10:20:00Z"
        }
    ]
}
```

`format` tells the file apart from any other kind. `version` is the version of this page's shape.

## Reading a file

- A file that is not JSON, names another `format`, or holds a player or a game that is not one is
  refused as not a file of saved games.
- A file whose `version` is newer than the app knows is refused whole, with a sentence that says
  to update the app. Reading the parts an older app understands would drop what the newer one
  saved, with nothing said.
- Nothing saved changes when a file is refused.

## Merging a file

A file is merged into what is already saved, whole or not at all:

- A player or a game that is not on the phone is added.
- A game that is on the phone is kept as whichever copy was changed later, by `changed`, so no
  game is there twice.
- A player who is on the phone keeps the name they have there.

## On the phone

The records are kept in IndexedDB, in a database named `gametabletally` with one store of players
and one of games, each keyed by `id`. The database's version is the saved shape's version, so a
later shape is brought in by the upgrade that opening the database at the new version runs.
Decision record 2 says why.

## Changing the shape

A change to what a record holds is a new version. It comes with an upgrade for the database, a
reader for files of the version before, a test from a saved file of that version, and this page
changed to describe it.
