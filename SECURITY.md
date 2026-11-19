# Security

## Reporting a vulnerability

Please report security issues privately through
[GitHub's private vulnerability reporting](https://github.com/jasonsdevspace/gametabletally/security/advisories/new)
rather than in a public issue.

## Supported versions

Nothing here is published as a package. The app is served from main, so a fix lands on main and
reaches the app with the next deploy. Older builds a phone still holds take the fix when its service
worker installs the newer one.

## What is in scope

The app runs on the phone with no server and no account. Games and players are kept in the
browser's own storage on the device, and nothing is sent anywhere. Reports about the code are
welcome, especially anything that lets a crafted backup file do more than restore games and
players, puts script into a page through a player's name or a saved game, or lets the service worker
serve something other than the app's own files.
