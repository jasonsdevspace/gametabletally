# Contributing

Game Table Tally is a portfolio project, and it is held to the checks below whoever opens a pull
request. Everyone taking part follows the [code of
conduct](https://github.com/jasonsdevspace/.github/blob/main/CODE_OF_CONDUCT.md).

## Setting up and running the checks

[Working on it](README.md#working-on-it) in the README says how to install and what each check
covers. Before a pull request, run these checks, which CI runs too:

```bash
npm run verify
npm run e2e
npm run lighthouse
```

`npm run e2e` and `npm run lighthouse` build the app first, and need
`npx playwright install chromium` the first time.

## Writing

Every file is held to one style, which the prose check enforces: no em dashes, no semicolons joining
clauses, American spelling, no issue numbers in comments, and no notes about the process, such as a
list of what is left to do, in anything a reader sees. A commit message says what changed and why in
plain sentences, with no em dash or semicolon, and names the work rather than whatever tool wrote it,
which the commit message check enforces. Installing with `npm ci` sets that check up as a hook on
each commit, beside one that lints and formats the staged files, and CI runs it on a pull request's
title and body.

## Issues

Issues follow the repository's templates, for a piece of work, a parent issue that holds several,
and a bug. Each piece of work says what is wrong or missing, what is already settled, and criteria a
test or a look can check. A bug says what happens, what should happen, how to see it and where.

## Pull requests

A pull request follows the template. Pull requests are squashed, so the title becomes the commit on
main, and the title and the body both pass the commit message check. The body says what changed and
why, with no counts, no checklist and no notes to the reviewer, and ends with "Closes #N", or "Part
of #N" when the issue has more to do. "Closes" is repeated before each issue a pull request
finishes, since GitHub reads only the first otherwise. Every check in CI passes before a pull
request is merged, the browser tests and the Lighthouse audit among them.

## Security

Report a security issue privately, as the [security policy](SECURITY.md) says, not in a public
issue.
