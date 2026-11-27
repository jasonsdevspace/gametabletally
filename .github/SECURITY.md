# Security

## Reporting a vulnerability

Please report security issues privately through
[GitHub's private vulnerability reporting](https://github.com/jasonsdevspace/gametabletally/security/advisories/new)
rather than in a public issue.

## Supported versions

Nothing here is published as a package. The app is built from main, so a fix lands on main and
reaches phones with the next deploy. A phone that holds an older build fetches the newer one on its
next visit with a connection, and runs it once the app has been closed.

## What is in scope

The app runs on the phone with no server and no account. Games and players are kept in the
browser's own storage on the device, and nothing is sent anywhere. Reports about the code are
welcome, especially anything that lets a crafted backup file do more than restore games and
players, puts script into a page through a player's name or a saved game, or lets the service worker
serve something other than the app's own files.

## Dependencies and licenses

What ships is the app, which carries React and the design kit, and the scoring package, which
depends on nothing, all under the MIT license. The tools used to build and check the project are
not shipped. Among them, the accessibility checker and a CSS parser are under the Mozilla Public
License, a lint plugin is under the GNU Lesser General Public License, and a package the
Lighthouse audit depends on is under the Functional Source License. All are accepted for tools
that run only in development.
