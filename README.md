# Game Table Tally

A scorekeeper for the game table. One phone is passed around, each player's round is entered with
a few taps, and the app applies the game's scoring rules, keeps the running totals and says who is
ahead. It works with no connection, and games, players and their history are saved on the phone.

It keeps score for card games people already own, starting with Flip 7, Skyjo and Wizard.

## Working on it

You need [Node.js 24](https://nodejs.org/) and Git. The version is in `.nvmrc`, so `nvm use` picks it.

```bash
npm ci
npm run dev
npm run verify
```

`npm run dev` serves the app with its changes as they are saved. `npm run verify` runs what CI
runs on every pull request: the type check, the lint rules, the formatting, a prose check, a check
that everything names the Node version in `.nvmrc`, the tests, the build, and the scoring cases run
against the built script in a runtime that is not Node.

- `packages/scoring` is `@gametabletally/scoring`, the games' scoring rules with no dependencies.
  Its [README](packages/scoring/README.md) says how a game is scored and how the rules are held
  to cases.
- `apps/web` is the app, which reads the scoring package from its source, so nothing needs
  building first. It keeps players and games on the phone in the shape
  [docs/saved-games.md](docs/saved-games.md) describes.

Installing sets up two hooks: one lints and formats the staged files, and one holds each commit
message to the house style. Pull requests are squashed, so a pull request's title becomes the
commit on main, and CI holds the title and the body to the same check.

The choices with a real alternative are written down under [docs/decisions](docs/decisions/README.md).

## Names and trademarks

Game Table Tally is not affiliated with, endorsed by or sponsored by the publishers of the games it
keeps score for. Flip 7, Skyjo and Wizard are trademarks of their owners and are named only to say
which games the app can score. It holds none of their artwork, cards or rule books.

## License

The code is under the [MIT License](LICENSE). The name Game Table Tally, its logo and the
gametabletally.com domain are not covered by that license and stay reserved.
